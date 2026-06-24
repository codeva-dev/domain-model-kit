import { err, errAsync, ok, ResultAsync, type Result } from 'neverthrow';
import z4 from 'zod/v4';
import { AggregateRoot, DomainEvent, DomainEventValidationError, Entity, PersistHandler, Repository } from '@codeva-dev/domain-model-kit/neverthrow';

const OrderIdSchema = z4.uuidv4().brand('OrderId');
type OrderId = z4.infer<typeof OrderIdSchema>;
const ProductIdSchema = z4.uuidv4().brand('ProductId');
type ProductId = z4.infer<typeof ProductIdSchema>;
const QuantitySchema = z4.number().int().positive().brand('Quantity');
type Quantity = z4.infer<typeof QuantitySchema>;

const EXAMPLE_ORDER_ID = '00000000-0000-4000-8000-000000000001';
const EXAMPLE_INITIAL_PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const EXAMPLE_ADDED_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';

const OrderItemSchema = z4.object({ productId: ProductIdSchema, quantity: QuantitySchema });
type OrderItem = z4.infer<typeof OrderItemSchema>;

const OrderCreatedPayloadSchema = z4.object({ orderId: OrderIdSchema, items: z4.array(OrderItemSchema) });
class OrderCreated extends DomainEvent.Class('order.created', OrderCreatedPayloadSchema) {}

const OrderItemAddedPayloadSchema = z4.object({ orderId: OrderIdSchema, item: OrderItemSchema });
class OrderItemAdded extends DomainEvent.Class('order.item.added', OrderItemAddedPayloadSchema) {}
const OrderEventDecoder = DomainEvent.Decoder(OrderCreated, OrderItemAdded);

class OrderDomainError extends Error {
	public readonly _tag = 'OrderDomainError';
}

class OrderPersistenceError extends Error {
	public readonly _tag = 'OrderPersistenceError';
}

type OrderRow = { id: OrderId; items: OrderItem[] };
type DbContext = { orders: Map<OrderId, OrderRow> };

const db: DbContext = { orders: new Map() };

class Product extends Entity.Class<ProductId>() {
	public constructor(id: ProductId, public readonly name: string) {
		super(id);
	}
}

class Order extends AggregateRoot.Class<OrderId>()(OrderCreated, OrderItemAdded) {
	private constructor(id: OrderId, public readonly items: readonly OrderItem[]) {
		super(id);
	}

	public static create(props: { id: OrderId; items: readonly OrderItem[] }): Result<Order, OrderDomainError | DomainEventValidationError> {
		if (props.items.length === 0) {
			return err(new OrderDomainError('Order must have at least one item'));
		}

		const order = new Order(props.id, props.items);
		return OrderCreated.create({ instanceId: order.id, payload: { orderId: order.id, items: [...order.items] } }).map(
			(event) => {
				order.recordDomainEvent(event);
				return order;
			},
		);
	}

	public addItem(product: Product, quantity: Quantity): Result<Order, DomainEventValidationError> {
		const item = { productId: product.id, quantity };
		const order = new Order(this.id, [...this.items, item]);

		return OrderItemAdded.create({ instanceId: order.id, payload: { orderId: order.id, item } }).map((event) => {
			order.recordDomainEvent(event);
			return order;
		});
	}
}

class OrderPersistHandler extends PersistHandler.Class({
	accepts: [OrderCreated, OrderItemAdded],
	handle(events, context: DbContext) {
		return events.map((event) => {
			switch (event.eventKey) {
				case 'order.created': {
					context.orders.set(event.payload.orderId, { id: event.payload.orderId, items: [...event.payload.items] });
					return ok(undefined);
				}
				case 'order.item.added': {
					const order = context.orders.get(event.payload.orderId);
					if (!order) return errAsync(new OrderPersistenceError('Order not found'));
					order.items.push(event.payload.item);
					return ok(undefined);
				}
			}
		});
	},
}) {}

class OrderRepository extends Repository.Class({ dbContext: db, persistHandlers: [new OrderPersistHandler()] }) {}

export async function runNeverthrowOrderExample() {
	const repository = new OrderRepository();
	const orderResult = Order.create({
		id: OrderIdSchema.parse(EXAMPLE_ORDER_ID),
		items: [{ productId: ProductIdSchema.parse(EXAMPLE_INITIAL_PRODUCT_ID), quantity: QuantitySchema.parse(1) }],
	});

	if (orderResult.isErr()) return errAsync(orderResult.error);

	const product = new Product(ProductIdSchema.parse(EXAMPLE_ADDED_PRODUCT_ID), 'Keyboard');
	const serialized = orderResult.value.getDomainEvents()[0]?.toJSON();

	if (!serialized) return errAsync(new OrderDomainError('Order creation did not record a domain event'));

	const decoded = OrderEventDecoder.decode(serialized);
	if (decoded.isErr()) return errAsync(decoded.error);

	return repository.save(orderResult.value).andThen(() => {
		const updated = orderResult.value.addItem(product, QuantitySchema.parse(1));
		if (updated.isErr()) return errAsync(updated.error);
		return repository.save(updated.value);
	});
}
