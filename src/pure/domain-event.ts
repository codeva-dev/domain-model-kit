import type z4 from 'zod/v4';
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
 * Base class for concrete domain events.
 *
 * Use `DomainEvent.Class(eventKey, payloadSchema)` instead of extending this class directly.
 */
export abstract class DomainEventBase<const TEventKey extends string = string, TPayload = unknown> {
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
	 * Serializes the event to a storage-friendly shape.
	 */
	public toJSON(): SerializedDomainEvent<TEventKey, TPayload> {
		return {
			eventKey: this.eventKey,
			instanceId: this.instanceId,
			occurredAt: this.occurredAt.toISOString(),
			payload: this.payload,
		};
	}
}

/**
 * Constructor and static API returned by `DomainEvent.Class(...)`.
 */
export type DomainEventClass<
	TEvent extends DomainEventBase = DomainEventBase,
	TPayload = TEvent extends DomainEventBase<string, infer TInferredPayload> ? TInferredPayload : unknown,
> = {
	readonly eventKey: TEvent['eventKey'];
	readonly payloadSchema: z4.ZodTypeAny;
	new (props: { instanceId: DomainInstanceId; payload: TPayload; occurredAt?: Date }): TEvent;
	create(props: { instanceId: DomainInstanceId; payload: unknown; occurredAt?: Date }): TEvent;
	decode(serialized: DomainEventDecodeInput): TEvent;
	is(event: DomainEventBase): event is TEvent;
};

export type EventFromClass<TClass extends DomainEventClass> = InstanceType<TClass>;
export type EventsFromDecoder<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;

function parseOccurredAt(occurredAt: string | Date): Date {
	const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);

	if (Number.isNaN(date.getTime())) {
		throw new DomainEventValidationError('Domain event occurredAt is invalid');
	}

	return date;
}

function makeDomainEvent<const TEventKey extends string, const TPayloadSchema extends z4.ZodTypeAny>(
	eventKey: TEventKey,
	payloadSchema: TPayloadSchema,
) {
	type Payload = z4.infer<TPayloadSchema>;

	class CreatedDomainEvent extends DomainEventBase<TEventKey, Payload> {
		public static readonly eventKey = eventKey;
		public static readonly payloadSchema = payloadSchema;

		public constructor(props: { instanceId: DomainInstanceId; payload: unknown; occurredAt?: Date }) {
			super({
				eventKey,
				instanceId: props.instanceId,
				occurredAt: props.occurredAt,
				payload: payloadSchema.parse(props.payload),
			});
		}

		public static create(props: { instanceId: DomainInstanceId; payload: unknown; occurredAt?: Date }): CreatedDomainEvent {
			const payload = payloadSchema.safeParse(props.payload);

			if (!payload.success) {
				throw new DomainEventValidationError('Domain event payload validation failed', payload.error);
			}

			const EventClass = this as unknown as new (props: {
				instanceId: DomainInstanceId;
				payload: Payload;
				occurredAt?: Date;
			}) => CreatedDomainEvent;

			return new EventClass({ ...props, payload: payload.data });
		}

		public static decode(serialized: DomainEventDecodeInput): CreatedDomainEvent {
			if (serialized.eventKey !== eventKey) {
				throw new DomainEventValidationError(`Expected domain event "${eventKey}", got "${serialized.eventKey}"`);
			}

			return this.create({
				instanceId: serialized.instanceId,
				occurredAt: parseOccurredAt(serialized.occurredAt),
				payload: serialized.payload,
			});
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
): InstanceType<TEventClass> {
	return eventClass.decode(serialized) as InstanceType<TEventClass>;
}

function makeDomainEventDecoder<const TEventClasses extends readonly DomainEventClass[]>(...eventClasses: TEventClasses) {
	type Event = EventsFromDecoder<TEventClasses>;
	const eventsByKey = new Map<string, TEventClasses[number]>();

	for (const eventClass of eventClasses) {
		if (eventsByKey.has(eventClass.eventKey)) {
			throw new DomainEventValidationError(`Duplicate domain event key "${eventClass.eventKey}"`);
		}

		eventsByKey.set(eventClass.eventKey, eventClass);
	}

	return {
		eventClasses,
		get(eventKey: string) {
			return eventsByKey.get(eventKey);
		},
		decode(serialized: DomainEventDecodeInput): Event {
			const eventClass = eventsByKey.get(serialized.eventKey);

			if (!eventClass) {
				throw new DomainEventValidationError(`Unknown domain event "${serialized.eventKey}"`);
			}

			return eventClass.decode(serialized) as Event;
		},
	};
}

export const DomainEvent = {
	/**
	 * Creates a domain event class with a literal event key and zod payload schema.
	 *
	 * @example
	 * class OrderCreated extends DomainEvent.Class(
	 *   "order.created",
	 *   z4.object({ orderId: OrderIdSchema })
	 * ) {}
	 */
	Class: makeDomainEvent,
	/**
	 * Creates a decoder for a known set of event classes.
	 *
	 * @example
	 * const OrderEventDecoder = DomainEvent.Decoder(OrderCreated, OrderItemAdded)
	 * const event = OrderEventDecoder.decode(serialized)
	 */
	Decoder: makeDomainEventDecoder,
	/**
	 * Decodes a serialized event with a specific event class.
	 */
	decode: decodeDomainEvent,
};
