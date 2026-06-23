import { Effect, Schema } from 'effect';
import { DomainEventValidationError } from './errors.js';

export type DomainInstanceId = string | number;

/**
 * Serialized domain event shape intended for outbox-style persistence.
 */
export type SerializedDomainEvent<TEventKey extends string = string, TPayload = unknown> = {
	eventKey: TEventKey;
	instanceId: DomainInstanceId;
	occurredAt: string;
	payload: TPayload;
};

/**
 * Input accepted by domain event decoders.
 */
export type DomainEventDecodeInput = {
	eventKey: string;
	instanceId: DomainInstanceId;
	occurredAt: string | Date;
	payload: unknown;
};

/**
 * Base class for concrete Effect domain events.
 *
 * Use `DomainEvent.Class(eventKey, payloadSchema)` instead of extending this class directly.
 */
export abstract class DomainEventBase<
	const TEventKey extends string = string,
	TPayload = unknown,
	TEncodedPayload = unknown,
> {
	public readonly eventKey: TEventKey;
	public readonly instanceId: DomainInstanceId;
	public readonly occurredAt: Date;
	public readonly payload: TPayload;

	protected constructor(props: {
		eventKey: TEventKey;
		instanceId: DomainInstanceId;
		occurredAt?: Date;
		payload: TPayload;
	}) {
		this.eventKey = props.eventKey;
		this.instanceId = props.instanceId;
		this.occurredAt = props.occurredAt ?? new Date();
		this.payload = props.payload;
	}

	/**
	 * Encodes the event with its Effect Schema payload encoder.
	 */
	public abstract encode(): Effect.Effect<SerializedDomainEvent<TEventKey, TEncodedPayload>, DomainEventValidationError>;
}

/**
 * Constructor and static API returned by `DomainEvent.Class(...)`.
 */
export type DomainEventClass<
	TEvent extends DomainEventBase = DomainEventBase,
	TPayload = any,
> = {
	readonly eventKey: TEvent['eventKey'];
	readonly payloadSchema: Schema.Schema.Any;
	readonly serializedSchema: Schema.Schema.Any;
	new (props: { instanceId: DomainInstanceId; payload: TPayload; occurredAt?: Date }): TEvent;
	create(props: {
		instanceId: DomainInstanceId;
		payload: unknown;
		occurredAt?: Date;
	}): Effect.Effect<TEvent, DomainEventValidationError>;
	decode(serialized: DomainEventDecodeInput): Effect.Effect<TEvent, DomainEventValidationError>;
	is(event: DomainEventBase): event is TEvent;
};

export type EventFromClass<TClass extends DomainEventClass> = InstanceType<TClass>;
export type EventsFromDecoder<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;

function parseOccurredAt(occurredAt: string | Date): Effect.Effect<Date, DomainEventValidationError> {
	const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);

	if (Number.isNaN(date.getTime())) {
		return Effect.fail(
			new DomainEventValidationError({
				message: 'Domain event occurredAt is invalid',
			}),
		);
	}

	return Effect.succeed(date);
}

function makeDomainEvent<const TEventKey extends string, const TPayloadSchema extends Schema.Schema.Any>(
	eventKey: TEventKey,
	payloadSchema: TPayloadSchema,
) {
	type Payload = Schema.Schema.Type<TPayloadSchema>;
	type EncodedPayload = Schema.Schema.Encoded<TPayloadSchema>;
	const serializedSchema = Schema.Struct({
		eventKey: Schema.Literal(eventKey),
		instanceId: Schema.Union(Schema.String, Schema.Number),
		occurredAt: Schema.String,
		payload: Schema.encodedSchema(payloadSchema),
	});

	class CreatedDomainEvent extends DomainEventBase<TEventKey, Payload, EncodedPayload> {
		public static readonly eventKey = eventKey;
		public static readonly payloadSchema = payloadSchema;
		public static readonly serializedSchema = serializedSchema;

		public constructor(props: { instanceId: DomainInstanceId; payload: Payload; occurredAt?: Date }) {
			super({
				eventKey,
				instanceId: props.instanceId,
				occurredAt: props.occurredAt,
				payload: props.payload,
			});
		}

		public static create(props: {
			instanceId: DomainInstanceId;
			payload: unknown;
			occurredAt?: Date;
		}): Effect.Effect<CreatedDomainEvent, DomainEventValidationError> {
			const EventClass = this as unknown as new (props: {
				instanceId: DomainInstanceId;
				payload: Payload;
				occurredAt?: Date;
			}) => CreatedDomainEvent;

			return Schema.decodeUnknown(payloadSchema)(props.payload).pipe(
				Effect.mapError(
					(error) =>
						new DomainEventValidationError({
							message: `Domain event payload validation failed: ${error.message}`,
						}),
				),
				Effect.map((payload) => new EventClass({ ...props, payload })),
			) as Effect.Effect<CreatedDomainEvent, DomainEventValidationError>;
		}

		public encode(): Effect.Effect<SerializedDomainEvent<TEventKey, EncodedPayload>, DomainEventValidationError> {
			return Schema.encodeUnknown(payloadSchema)(this.payload).pipe(
				Effect.mapError(
					(error) =>
						new DomainEventValidationError({
							message: `Domain event payload encoding failed: ${error.message}`,
						}),
				),
				Effect.map((payload) => ({
					eventKey,
					instanceId: this.instanceId,
					occurredAt: this.occurredAt.toISOString(),
					payload: payload as EncodedPayload,
				})),
			) as Effect.Effect<SerializedDomainEvent<TEventKey, EncodedPayload>, DomainEventValidationError>;
		}

		public static decode(serialized: DomainEventDecodeInput): Effect.Effect<CreatedDomainEvent, DomainEventValidationError> {
			if (serialized.eventKey !== eventKey) {
				return Effect.fail(
					new DomainEventValidationError({
						message: `Expected domain event "${eventKey}", got "${serialized.eventKey}"`,
					}),
				);
			}

			return parseOccurredAt(serialized.occurredAt).pipe(
				Effect.flatMap((occurredAt) =>
					this.create({
						instanceId: serialized.instanceId,
						occurredAt,
						payload: serialized.payload,
					}),
				),
			);
		}

		public static is(event: DomainEventBase): event is CreatedDomainEvent {
			return event.eventKey === eventKey;
		}
	}

	return CreatedDomainEvent;
}

function decodeDomainEvent<TEventClass extends DomainEventClass>(
	eventClass: TEventClass,
	serialized: DomainEventDecodeInput,
): Effect.Effect<InstanceType<TEventClass>, DomainEventValidationError> {
	return eventClass.decode(serialized) as Effect.Effect<InstanceType<TEventClass>, DomainEventValidationError>;
}

function makeDomainEventDecoder<const TEventClasses extends readonly DomainEventClass[]>(...eventClasses: TEventClasses) {
	type Event = EventsFromDecoder<TEventClasses>;
	const eventsByKey = new Map<string, TEventClasses[number]>();

	for (const eventClass of eventClasses) {
		if (eventsByKey.has(eventClass.eventKey)) {
			throw new DomainEventValidationError({
				message: `Duplicate domain event key "${eventClass.eventKey}"`,
			});
		}

		eventsByKey.set(eventClass.eventKey, eventClass);
	}

	return {
		eventClasses,
		get(eventKey: string) {
			return eventsByKey.get(eventKey);
		},
		decode(serialized: DomainEventDecodeInput): Effect.Effect<Event, DomainEventValidationError> {
			const eventClass = eventsByKey.get(serialized.eventKey);

			if (!eventClass) {
				return Effect.fail(
					new DomainEventValidationError({
						message: `Unknown domain event "${serialized.eventKey}"`,
					}),
				);
			}

			return eventClass.decode(serialized) as Effect.Effect<Event, DomainEventValidationError>;
		},
	};
}

export const DomainEvent = {
	/**
	 * Creates a domain event class with a literal event key and Effect Schema payload schema.
	 *
	 * @example
	 * class OrderCreated extends DomainEvent.Class(
	 *   "order.created",
	 *   Schema.Struct({ orderId: OrderIdSchema })
	 * ) {}
	 */
	Class: makeDomainEvent,
	/**
	 * Creates a decoder for a known set of event classes.
	 *
	 * @example
	 * const OrderEventDecoder = DomainEvent.Decoder(OrderCreated, OrderItemAdded)
	 * const event = yield* OrderEventDecoder.decode(serialized)
	 */
	Decoder: makeDomainEventDecoder,
	/**
	 * Decodes a serialized event with a specific event class.
	 */
	decode: decodeDomainEvent,
};
