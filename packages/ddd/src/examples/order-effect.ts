import { Effect, Schema } from 'effect';
import { AggregateRoot, DomainError, DomainEvent, Entity, PersistHandler, Repository } from '../effect/index.js';

const OrderIdSchema = Schema.UUID.pipe(Schema.brand('OrderId'));
type OrderId = typeof OrderIdSchema.Type;
const ProductIdSchema = Schema.UUID.pipe(Schema.brand('ProductId'));
type ProductId = typeof ProductIdSchema.Type;
const QuantitySchema = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.brand('Quantity'));
type Quantity = typeof QuantitySchema.Type;

const EXAMPLE_ORDER_ID = '00000000-0000-4000-8000-000000000001';
const EXAMPLE_INITIAL_PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const EXAMPLE_ADDED_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';

const OrderItemSchema = Schema.Struct({ productId: ProductIdSchema, quantity: QuantitySchema });
type OrderItem = typeof OrderItemSchema.Type;

class OrderCreated extends DomainEvent.Class('order.created', Schema.Struct({ orderId: OrderIdSchema, items: Schema.Array(OrderItemSchema) })) {}
class OrderItemAdded extends DomainEvent.Class('order.item.added', Schema.Struct({ orderId: OrderIdSchema, item: OrderItemSchema })) {}
const OrderEvents = [OrderCreated, OrderItemAdded] as const;
const OrderEventDecoder = DomainEvent.Decoder(...OrderEvents);

const OrderDomainError = DomainError.Class('OrderDomainError');
type OrderDomainError = InstanceType<typeof OrderDomainError>;
const OrderPersistenceError = DomainError.Class('OrderPersistenceError');
type OrderPersistenceError = InstanceType<typeof OrderPersistenceError>;

type OrderRow = { id: OrderId; items: OrderItem[] };
type DbContext = { orders: Map<OrderId, OrderRow> };

class OrderDb extends Effect.Service<OrderDb>()('OrderDb', {
	succeed: {
		orders: new Map<OrderId, OrderRow>(),
	} satisfies DbContext,
}) {}

class Product extends Entity.Class<ProductId>() {
	public constructor(id: ProductId, public readonly name: string) {
		super(id);
	}
}

class Order extends AggregateRoot.Class<OrderId>()(...OrderEvents) {
	private constructor(id: OrderId, public readonly items: readonly OrderItem[]) {
		super(id);
	}

	public static create(props: { id: OrderId; items: readonly OrderItem[] }) {
		return Effect.gen(function* () {
			if (props.items.length === 0) {
				return yield* Effect.fail(new OrderDomainError({ message: 'Order must have at least one item' }));
			}

			const order = new Order(props.id, props.items);
			const event = yield* OrderCreated.create({ instanceId: order.id, payload: { orderId: order.id, items: [...order.items] } });
			order.recordDomainEvent(event);
			return order;
		});
	}

	public addItem(product: Product, quantity: Quantity) {
		const item = { productId: product.id, quantity };
		const order = new Order(this.id, [...this.items, item]);
		return OrderItemAdded.create({ instanceId: order.id, payload: { orderId: order.id, item } }).pipe(
			Effect.map((event) => {
				order.recordDomainEvent(event);
				return order;
			}),
		);
	}

	public static hydrate(props: { id: OrderId; items: readonly OrderItem[] }) {
		return Effect.gen(function* () {
			if (props.items.length === 0) {
				return yield* Effect.fail(new OrderDomainError({ message: 'Hydrated order must have at least one item' }));
			}

			return new Order(props.id, props.items);
		});
	}
}

class OrderPersistHandler extends PersistHandler.Service<OrderPersistHandler>()('OrderPersistHandler', {
	accepts: OrderEvents,
	dependencies: [OrderDb.Default],
	handle(events) {
		return Effect.gen(function* () {
			const db = yield* OrderDb;

			return yield* Effect.sync(() => {
				for (const event of events) {
					switch (event.eventKey) {
						case 'order.created':
							db.orders.set(event.payload.orderId, { id: event.payload.orderId, items: [...event.payload.items] });
							break;
						case 'order.item.added': {
							const order = db.orders.get(event.payload.orderId);
							if (!order) throw new OrderPersistenceError({ message: 'Order not found' });
							order.items.push(event.payload.item);
							break;
						}
					}
				}
			}).pipe(Effect.mapError(() => new OrderPersistenceError({ message: 'Persist failed' })));
		});
	},
}) {}

class OrderRepository extends Repository.Service<OrderRepository>()('OrderRepository', {
	persistHandlers: [OrderPersistHandler],
	dependencies: [OrderDb.Default, OrderPersistHandler.Default],
}) {
	public findById(id: OrderId) {
		return Effect.gen(function* () {
			const db = yield* OrderDb;
			const order = db.orders.get(id);

			if (!order) {
				return yield* Effect.fail(new OrderPersistenceError({ message: 'Order not found' }));
			}

			return yield* Order.hydrate(order);
		});
	}
}

export const runEffectOrderExample = Effect.gen(function* () {
	const repository = yield* OrderRepository;
	const order = yield* Order.create({
		id: OrderIdSchema.make(EXAMPLE_ORDER_ID),
		items: [{ productId: ProductIdSchema.make(EXAMPLE_INITIAL_PRODUCT_ID), quantity: QuantitySchema.make(1) }],
	});
	const product = new Product(ProductIdSchema.make(EXAMPLE_ADDED_PRODUCT_ID), 'Keyboard');
	const createdEvent = order.getDomainEvents()[0];

	if (!createdEvent) {
		return yield* Effect.fail(new OrderDomainError({ message: 'Order creation did not record a domain event' }));
	}

	const serialized = yield* createdEvent.encode();
	yield* OrderEventDecoder.decode(serialized);

	yield* repository.save(order);
	yield* repository.findById(order.id);
	const updated = yield* order.addItem(product, QuantitySchema.make(1));
	yield* repository.save(updated);
}).pipe(Effect.provide(OrderRepository.Default));
