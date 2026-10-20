# TallyVeridexERP — Phase 3: Inventory Data Model & Schema Specifications

## 1. Overview

The inventory subsystem utilizes 7 dedicated Mongoose schemas designed for multi-tenant, multi-company accounting integrity. Every document is strictly partitioned by `tenant_id` and `company_id`.

---

## 2. Model Schemas & Indexing Strategies

### 1. `StockGroup` (`stock_groups`)
Hierarchical grouping of stock items with cycle prevention and parent-child navigation.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `group_code` | `String` | required, uppercase, trimmed | Unique group identifier (e.g., `RAW_MAT`, `FINISHED_GOODS`) |
| `group_name` | `String` | required, trimmed | Display name |
| `parent_group_id`| `ObjectId` | default `null`, ref `StockGroup` | Self-referencing parent pointer |
| `description` | `String` | default `""` | Informational group notes |
| `status` | `String` | enum `['ACTIVE', 'INACTIVE']`, default `'ACTIVE'` | Operational status |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, group_code: 1 }` (Unique)
- `{ tenant_id: 1, company_id: 1, parent_group_id: 1 }`

---

### 2. `StockCategory` (`stock_categories`)
Parallel classification mechanism orthogonal to groups (e.g. classification by brand, grade, or material type).

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `category_code`| `String` | required, uppercase, trimmed | Unique category code |
| `category_name`| `String` | required, trimmed | Display category name |
| `description` | `String` | default `""` | Description |
| `status` | `String` | enum `['ACTIVE', 'INACTIVE']`, default `'ACTIVE'` | Status |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, category_code: 1 }` (Unique)

---

### 3. `UnitOfMeasurement` (`units_of_measurement`)
Universal and company-specific measurement definitions.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `unit_code` | `String` | required, uppercase, trimmed | Standard unit code (e.g., `PCS`, `BOX`, `KG`, `LTR`) |
| `unit_name` | `String` | required, trimmed | Unit name (e.g., `Pieces`, `Box`, `Kilogram`) |
| `symbol` | `String` | required, trimmed | Display symbol (e.g., `pcs`, `box`, `kg`) |
| `unit_type` | `String` | enum `['COUNT', 'MASS', 'VOLUME', 'LENGTH', 'PACKAGING', 'CUSTOM']` | Physical dimension |
| `decimal_places`| `Number` | min 0, max 6, default 0 | Allowed precision for transactions |
| `is_system_standard`| `Boolean` | default `false` | System-seeded vs user-defined flag |
| `status` | `String` | enum `['ACTIVE', 'INACTIVE']`, default `'ACTIVE'` | Status |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, unit_code: 1 }` (Unique)

---

### 4. `Godown` (`godowns`)
Physical or logical locations where stock is stored.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `godown_code` | `String` | required, uppercase, trimmed | Unique godown code (e.g., `MAIN`, `WH_NORTH`) |
| `godown_name` | `String` | required, trimmed | Display location name |
| `is_default` | `Boolean` | default `false` | Primary default godown for transactions |
| `address` | `Object` | street, city, state, postal_code, country | Physical location address |
| `status` | `String` | enum `['ACTIVE', 'INACTIVE']`, default `'ACTIVE'` | Operational status |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, godown_code: 1 }` (Unique)

---

### 5. `StockItem` (`stock_items`)
Master product catalog containing UOM relationships, packaging conversions, pricing, and valuation configuration.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `item_code` | `String` | required, uppercase, trimmed | Unique item code (e.g., `BOLT_M8`) |
| `sku` | `String` | required, uppercase, trimmed | Unique SKU (e.g., `SKU-BOLT-M8-50`) |
| `item_name` | `String` | required, trimmed | Item title |
| `barcodes` | `[String]` | indexed | EAN/UPC barcodes |
| `stock_group_id` | `ObjectId` | ref `StockGroup` | Assigned stock group |
| `stock_category_id` | `ObjectId` | ref `StockCategory` | Assigned stock category |
| `base_uom_id` | `ObjectId` | required, ref `UnitOfMeasurement` | **Immutable** base stock keeping unit |
| `purchase_uom_id` | `ObjectId` | ref `UnitOfMeasurement` | Default purchase unit |
| `sales_uom_id` | `ObjectId` | ref `UnitOfMeasurement` | Default sales unit |
| `uom_conversions` | `Array` | `[{ alternate_uom_id, conversion_factor }]` | Item-specific packaging ratios |
| `costing_method` | `String` | enum `['AVERAGE_COST', 'FIFO', 'STANDARD_COST']` | Inventory costing method |
| `purchase_price` | `Decimal128` | default 0 | Standard purchase rate |
| `sales_price` | `Decimal128` | default 0 | Standard selling rate |
| `is_stock_tracked` | `Boolean` | default `true` | Track inventory balances |
| `status` | `String` | enum `['ACTIVE', 'INACTIVE']`, default `'ACTIVE'` | Operational status |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, item_code: 1 }` (Unique)
- `{ tenant_id: 1, company_id: 1, sku: 1 }` (Unique)
- `{ tenant_id: 1, company_id: 1, barcodes: 1 }`

---

### 6. `StockMovement` (`stock_movements`)
Immutable, append-only transaction ledger. Documents are never modified or deleted.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `stock_item_id` | `ObjectId` | required, ref `StockItem` | Stock item reference |
| `godown_id` | `ObjectId` | required, ref `Godown` | Warehouse/godown reference |
| `movement_type` | `String` | enum `['OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALES_DELIVERY', 'TRANSFER_IN', 'TRANSFER_OUT', 'PHYSICAL_IN', 'PHYSICAL_OUT', 'REVERSAL', 'SCRAP_WASTE']` | Type of stock transaction |
| `movement_date` | `Date` | required, default `Date.now` | Effective transaction date |
| `quantity` | `Decimal128` | required | Transaction quantity in transaction UOM |
| `uom_id` | `ObjectId` | required, ref `UnitOfMeasurement` | Transaction UOM |
| `base_quantity` | `Decimal128` | required | Signed quantity in item's base UOM (positive for inflow, negative for outflow) |
| `base_uom_id` | `ObjectId` | required, ref `UnitOfMeasurement` | Item's base UOM |
| `conversion_factor`| `Decimal128`| required, default 1 | Applied ratio (`quantity * conversion_factor = base_quantity`) |
| `unit_rate` | `Decimal128` | required | Unit cost or valuation rate |
| `total_cost` | `Decimal128` | required | Total financial valuation (`base_quantity * unit_rate`) |
| `batch_number` | `String` | optional | Batch tracking identifier |
| `idempotency_key` | `String` | required, unique per company | Deduplication key |
| `is_reversed` | `Boolean` | default `false` | Reversal status flag |
| `reversal_of_movement_id` | `ObjectId` | optional, ref `StockMovement` | Pointer to reversed movement |
| `notes` | `String` | optional | Audit memo |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, idempotency_key: 1 }` (Unique)
- `{ tenant_id: 1, company_id: 1, stock_item_id: 1, godown_id: 1, movement_date: -1 }`
- `{ tenant_id: 1, company_id: 1, movement_type: 1 }`

---

### 7. `StockBalance` (`stock_balances`)
Materialized view of on-hand inventory per item and godown.

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `ObjectId` | required, indexed | Root tenant workspace reference |
| `company_id` | `ObjectId` | required, indexed | Company set of books reference |
| `stock_item_id` | `ObjectId` | required, ref `StockItem` | Stock item reference |
| `godown_id` | `ObjectId` | required, ref `Godown` | Godown reference |
| `quantity_on_hand` | `Decimal128` | required, default 0 | Projected quantity in base UOM |
| `average_unit_cost` | `Decimal128` | required, default 0 | Moving-average unit cost |
| `total_inventory_value` | `Decimal128` | required, default 0 | Total on-hand financial value |
| `last_movement_at` | `Date` | optional | Timestamp of latest movement |
| `row_version` | `Number` | default 1 | Optimistic concurrency control |

**Indexes:**
- `{ tenant_id: 1, company_id: 1, stock_item_id: 1, godown_id: 1 }` (Unique)
