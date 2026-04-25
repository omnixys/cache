# @omnixys/cache

Cache infrastructure module for Omnixys microservices.

This package provides a fully integrated Cache event system for NestJS applications including:

The package is designed as a reusable infrastructure layer for the Omnixys platform.


# Installation

```bash
pnpm add @omnixys/cache
````

---

# Basic Usage

## Register Cache Module

```ts
import { CacheModule } from "@omnixys/cache";

@Module({
  imports: [
    CacheModule.forRoot({
      clientId: "invitation-service",
      brokers: ["localhost:9092"],
      groupId: "invitation-consumer",
    }),
  ],
})
export class AppModule {}
```

---

# Publishing Events

Use the `CacheProducerService` to publish events.

```ts
import { CacheProducerService, CacheTopics } from "@omnixys/cache";

@Injectable()
export class InvitationPublisher {
  constructor(private readonly cache: CacheProducerService) {}

  async deleteInvitation(invitationId: string) {
    await this.cache.send(
      CacheTopics.invitation.deleteInvitation,
      {
        invitationId
      },
      "invitation-service"
    );
  }
}
```

---

# Consuming Events

Cache event handlers are defined using decorators.

```ts
import {
  CacheHandler,
  CacheEvent,
  CacheTopics,
  CacheEventContext,
} from "@omnixys/cache";

@CacheHandler("InvitationHandler")
export class InvitationHandler {

  @CacheEvent(CacheTopics.invitation.deleteInvitation)
  async handleDeleteInvitation(
    topic: string,
    payload: { invitationId: string },
    context: CacheEventContext
  ) {
    console.log("Deleting invitation:", payload.invitationId);
  }

}
```

The handler will be automatically discovered and registered.

---

# Cache Event Envelope

All Cache messages follow a standardized envelope structure.

```json
{
  "event": "deleteInvitation",
  "service": "invitation-service",
  "version": "v1",
  "payload": {
    "invitationId": "abc123"
  }
}
```

This ensures consistency across services.

---

# Cache Topics

Cache topics are centrally defined:

```ts
export const CacheTopics = {
  ticket: {
    deleteTickets: "ticket.delete.user"
  },

  invitation: {
    deleteInvitation: "invitation.delete.user",
    addGuestId: "invitation.addGuestId.user"
  },

  logstream: {
    log: "logstream.log.user"
  }
}
```

---

# Typed Cache Events

The package supports typed Cache events through an event registry.

```ts
export interface CacheEventRegistry {
  [CacheTopics.invitation.deleteInvitation]: {
    invitationId: string
  }
}
```

This enables compile-time validation of event payloads.

Example:

```ts
await cache.send(
  CacheTopics.invitation.deleteInvitation,
  {
    invitationId: "abc123"
  }
)
```

Invalid payloads will fail during TypeScript compilation.

---

# Cache Headers

The system automatically attaches standardized Cache headers.

Example headers:

```
x-trace-id
x-event-name
x-event-type
x-event-version
x-service
```

These headers enable:

* distributed tracing
* event metadata inspection
* debugging and observability

---

# Architecture

The internal event flow looks like this:

```
Service
   ↓
CacheProducerService
   ↓
Cache
   ↓
CacheConsumerService
   ↓
CacheEventDispatcher
   ↓
@CacheEvent handler
```

---

# Graceful Shutdown

The Cache module automatically disconnects producer and consumer instances when the NestJS application shuts down.

Supported signals:

* SIGINT
* SIGTERM
* app.close()

---

# License

GPL-3.0-or-later

Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
