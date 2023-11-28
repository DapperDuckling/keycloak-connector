
export type EventListenerFunction<Event> = (event: Event, payload?: unknown) => void;
type ClassEventFunction<Event> = (event: Event | "*", listener: EventListenerFunction<Event>) => void;
type DispatchEventFunction<Event> = {
    <T>(event: Event, payload: T): void;
    (event: Event): void;
};

/**
 * EventListener
 * @desc Provides a generic event listener class that supports wildcard listeners
 */
export class EventListener<Event extends string> {
    private eventListeners = new Map<Event | "*", Set<EventListenerFunction<Event>>>();

    public addEventListener: ClassEventFunction<Event> = (event, listener) => {
        // Grab the listener set for this event
        let targetByEventSet = this.eventListeners.get(event);
        if (targetByEventSet === undefined) {
            // Create a new set if this is the first registration for this event
            targetByEventSet = new Set();

            // Store the new set
            this.eventListeners.set(event, targetByEventSet)
        }

        // Add the listener to the byEvent set
        targetByEventSet.add(listener);
    }

    public removeEventListener: ClassEventFunction<Event> = (event, listener) => this.eventListeners.get(event)?.delete(listener);

    public dispatchEvent: DispatchEventFunction<Event> = <T>(event: Event, payload?: T) => {
        this.eventListeners.get(event)?.forEach(listener => listener(event, payload));
        this.eventListeners.get('*')?.forEach(listener => listener(event, payload));
    }
}
