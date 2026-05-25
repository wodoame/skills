---
name: springboot-systems-architect
description: A skill for structuring a Spring Boot project
---

## Query Parameter Handling

When a service starts taking **too many parameters**, that’s usually a signal that the design is getting fragile.

The most common (and cleanest) solution is the **Parameter Object pattern** — often combined with **Builder** in modern Java.

Let’s walk through it clearly.

---

# 🚨 The Problem: Too Many Parameters

### ❌ Typical growth problem

```java
public Page<Product> findProducts(
        int page,
        int size,
        String q,
        String category,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        String sortField,
        String sortDirection,
        Boolean inStock,
        Boolean discountOnly
) {
    ...
}
```

Looks okay initially — until:

* Hard to read
* Easy to mix parameter order
* Adding a new filter breaks callers
* Tests become ugly
* Method signatures keep changing

This is called a **Long Parameter List smell**.

---

# ✅ Solution: Parameter Object Pattern

Instead of many parameters, group them into one object.

### ✔ Step 1 — Create a Query Object

```java
@Getter
@Builder
public class ProductQuery {

    private int page;
    private int size;

    private String search;
    private String category;

    private BigDecimal minPrice;
    private BigDecimal maxPrice;

    private String sortField;
    private String sortDirection;

    private Boolean inStock;
    private Boolean discountOnly;
}
```

Now your service becomes:

```java
public Page<Product> findProducts(ProductQuery query) {
    ...
}
```

---

# 🎯 Why This Is Better

## 1️⃣ Readability improves immediately

Before:

```java
findProducts(0, 20, "phone", "tech", null, null, "price", "desc", true, false);
```

After:

```java
ProductQuery query = ProductQuery.builder()
        .page(0)
        .size(20)
        .search("phone")
        .category("tech")
        .sortField("price")
        .sortDirection("desc")
        .inStock(true)
        .build();
```

Instant clarity.

---

## 2️⃣ Adding new options is painless

Need a new filter?

```java
private String brand;
```

No service signature changes.

No cascading refactors.

---

## 3️⃣ Eliminates parameter ordering bugs

This is a REAL issue:

```java
findProducts(0, 20, "price", "desc", ...)
```

Did you accidentally swap parameters?

Builder pattern removes this entirely.

---

## 4️⃣ Makes Validation Easier

You can validate once:

```java
public void validate(ProductQuery query) {
    if (query.getMinPrice() != null &&
        query.getMaxPrice() != null &&
        query.getMinPrice().compareTo(query.getMaxPrice()) > 0) {
        throw new IllegalArgumentException();
    }
}
```

---

# 🧠 The Pattern Combo Senior Devs Use

Usually these patterns together:

### ✔ Parameter Object

Encapsulates arguments.

### ✔ Builder Pattern

Prevents constructor hell.

### ✔ Specification Pattern (optional)

Builds dynamic queries from the object.

---

# 🔥 Real Growth Scenario

Without this pattern:

```
Controller → Service → Repository

All methods change when a new filter is added.
```

With query object:

```
Controller builds ProductQuery
         ↓
Service consumes ProductQuery
         ↓
Specifications read ProductQuery
```

Only one object evolves.

---

# 🧩 Example of Scaling Nicely

Service:

```java
public Page<ProductDto> findProducts(ProductQuery query) {

    Pageable pageable = pageableFactory.from(query);

    Specification<Product> spec =
            ProductSpecifications.from(query);

    return repo.findAll(spec, pageable)
               .map(ProductDto::from);
}
```

Specification:

```java
public static Specification<Product> from(ProductQuery q) {
    return Specification.where(search(q.getSearch()))
            .and(category(q.getCategory()))
            .and(priceRange(q.getMinPrice(), q.getMaxPrice()))
            .and(inStock(q.getInStock()));
}
```

Adding new filters becomes **plug-and-play**.

---

# 🚀 Bonus: Hidden Big Advantage

Parameter objects can later become:

* API request models
* cache keys
* logging objects
* analytics inputs

This is why large systems rely on them heavily.

