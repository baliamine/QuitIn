import { EventEmitter } from 'events';

export const NOTIFICATION_NEW = 'notification:new';

/** Shared in-process bus between NotificationsService and the socket gateway. */
export const notificationEvents = new EventEmitter();
notificationEvents.setMaxListeners(0);
