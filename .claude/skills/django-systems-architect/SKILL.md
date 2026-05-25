---
name: django-systems-architect
description: A skill for structuring a Django project
---

This document teaches AI agents and contributors how backend logic is structured in this Django project.

The architecture is inspired by layered systems such as Spring Boot while remaining idiomatic to Django.

The main goal is:

**Keep views thin and move business logic into services.**

---

# Core Principles

## 1. Views Are HTTP Adapters

Views should only handle HTTP concerns.

Responsibilities of a view:

* parse request data
* call a service or selector
* return a response

Views should **not contain business logic**.

Good example:

```python
def create_order_view(request):
    order = create_order(user=request.user)
    return JsonResponse({"order_id": order.id})
```

Bad example:

```python
def create_order_view(request):
    cart_items = Cart.objects.filter(user=request.user)

    if not cart_items.exists():
        return JsonResponse({"error": "Cart empty"})

    total = sum(item.product.price * item.quantity for item in cart_items)

    order = Order.objects.create(user=request.user, total=total)

    return JsonResponse({"order_id": order.id})
```

The view above contains business logic and database logic. This is discouraged.

**Rule:** Views should typically be **3–10 lines long**.

---

# Layered Architecture

The backend is structured into four logical layers.

```
Views
  ↓
Services
  ↓
Selectors
  ↓
Models
```

## Views

Location:

```
app/views/
```

Purpose:

* HTTP entry points
* convert request → service calls → responses

Views should **not perform complex queries or business workflows**.

---

## Services

Location:

```
app/services/
```

Purpose:

Services contain **business logic and workflows**.

Services coordinate:

* validation
* database writes
* side effects
* multiple models
* calls to external systems

Example:

```python
def register_user(email, password):
    if User.objects.filter(email=email).exists():
        raise ValueError("Email already registered")

    user = User.objects.create_user(email=email, password=password)

    create_user_profile(user)
    send_welcome_email(user)

    return user
```

Services represent **business actions**.

Examples:

```
create_order
cancel_subscription
register_user
refund_payment
activate_account
```

Services should **not depend on HTTP objects like `request`**.

Bad:

```
create_order(request)
```

Good:

```
create_order(user)
```

This keeps services reusable and easy to test.

---

## Selectors

Location:

```
app/selectors/
```

Purpose:

Selectors contain **read-only database queries**.

Selectors centralize complex ORM logic so queries are not scattered across the codebase.

Example:

```python
def get_orders_for_user(user):
    return (
        Order.objects
        .filter(user=user)
        .prefetch_related("items__product")
    )
```

Selectors should:

* return models or querysets
* not modify the database
* not contain business workflows

Think of selectors as **SELECT queries**.

---

## Models

Location:

```
app/models.py
```

Models define:

* data structure
* relationships
* basic domain behavior

Avoid placing large workflows inside models. Those belong in services.

---

# Responsibility Rules

| Layer     | Responsibility                 |
| --------- | ------------------------------ |
| Views     | HTTP handling                  |
| Services  | business logic + state changes |
| Selectors | read queries                   |
| Models    | data structure                 |

---

# Query Rules

Avoid scattering ORM queries across the codebase.

Bad:

```
views.py
tasks.py
signals.py
services.py
```

All containing duplicate queries.

Instead centralize them in selectors.

Good:

```
selectors/order_selectors.py
```

---

# Testing Strategy

The architecture enables clear testing layers.

### Service Tests

Test business logic directly.

```
tests/services/test_order_service.py
```

These tests should not require HTTP requests.

Example:

```python
def test_create_order():
    user = UserFactory()
    CartFactory(user=user)

    order = create_order(user)

    assert order.user == user
```

---

### Selector Tests

Test database queries.

```
tests/selectors/test_order_selectors.py
```

---

### View Tests

Views should have minimal logic, so only a small number of integration tests are needed.

```
tests/views/test_orders.py
```

---

# Anti-Patterns

Avoid these mistakes.

### Fat Views

Views should not contain:

* business workflows
* complex database logic
* long functions

---

### Service Wrappers Around the ORM

Bad:

```
get_user()
create_user()
update_user()
```

These functions simply wrap the ORM and add no value.

Services should represent **business actions**, not basic CRUD operations.

---

### Passing Request Objects Into Services

Bad:

```
create_order(request)
```

Good:

```
create_order(user)
```

Services should remain independent of Django's HTTP layer.

---

# Design Heuristics

When writing code, ask these questions.

**Does this represent a business action?**

→ Put it in a **service**.

**Is this just retrieving data?**

→ Put it in a **selector**.

**Is this related to HTTP?**

→ Put it in a **view**.

---

# Goal of This Architecture

This structure provides:

* thin views
* reusable business logic
* centralized query logic
* easier testing
* maintainable large codebases

This approach makes Django architecture similar to layered frameworks such as Spring Boot while remaining simple and idiomatic.


## Skill: Logging Instead of Print Statements (Python)

### Rule

Always use the **Python `logging` module** instead of `print()` for application messages.

`print()` may only be used for:

* quick debugging
* temporary local experiments
* CLI output intended for users

All internal application events must use **logging**.

### Standard Pattern

Every module should create its own logger:

```python
import logging

logger = logging.getLogger(__name__)
```

This ensures logs indicate **which module produced them**.

---

### Log Level Usage

Use levels consistently:

* `logger.debug()` → detailed developer diagnostics
* `logger.info()` → normal system events
* `logger.warning()` → unexpected but recoverable situations
* `logger.error()` → failures that affect functionality
* `logger.critical()` → system-wide failure

Example:

```python
logger.info("User %s logged in", user_id)
logger.warning("Rate limit approaching")
logger.error("Database connection failed")
```

---

### Message Formatting Rule

Always use **lazy formatting** instead of f-strings.

Correct:

```python
logger.info("User %s logged in", user_id)
```

Avoid:

```python
logger.info(f"User {user_id} logged in")
```

Reason: lazy formatting avoids unnecessary string creation when the log level is disabled.

---

### Debugging Rule

Temporary debugging logs should use `DEBUG` level:

```python
logger.debug("Payload received: %s", payload)
```

Never leave debugging `print()` statements in committed code.

---

### Summary

**Always prefer logging over print for application logic.**

```
print() → quick debugging or CLI output
logging → application diagnostics and events
```
