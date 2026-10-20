# TallyVeridexERP — Phase 3: Core Inventory API Reference

All inventory endpoints are mounted at `/api/v1/inventory` and strictly require authentication, tenant workspace context, and validated company context.

### Common Request Headers
| Header | Required | Description |
| :--- | :--- | :--- |
| `Authorization` | Yes | `Bearer <JWT_ACCESS_TOKEN>` |
| `x-tenant-id` | Yes | Active Tenant ObjectId |
| `x-company-id` | Yes | Target Company ObjectId (Must belong to tenant, user must hold membership) |

---

## 1. Stock Groups

### `GET /api/v1/inventory/groups`
List stock groups for the active company.
- **Permission**: `INVENTORY:VIEW`
- **Query Params**: `status` (ACTIVE/INACTIVE), `parent_group_id` (ObjectId or 'null' for root groups).
- **Response**: Array of `StockGroup` documents.

### `POST /api/v1/inventory/groups`
Create a new stock group.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Body**:
  ```json
  {
    "group_code": "HARDWARE",
    "group_name": "Hardware & Construction Tools",
    "parent_group_id": null,
    "description": "General building and hardware items"
  }
  ```
- **Response**: `201 Created`

### `PATCH /api/v1/inventory/groups/:id`
Update an existing stock group. Prevents self-parenting and circular hierarchical inheritance.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Error Codes**: `CIRCULAR_GROUP_DEPENDENCY` (400), `SELF_PARENT_CYCLE` (400).

### `DELETE /api/v1/inventory/groups/:id`
Deactivate a stock group. Rejects if active subgroups or stock items reference the group.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Error Codes**: `GROUP_HAS_ACTIVE_SUBGROUPS` (400), `GROUP_HAS_ACTIVE_ITEMS` (400).

---

## 2. Stock Categories

### `GET /api/v1/inventory/categories`
List stock categories for active company.
- **Permission**: `INVENTORY:VIEW`

### `POST /api/v1/inventory/categories`
Create stock category.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Body**: `{ "category_code": "FASTENERS", "category_name": "Industrial Fasteners" }`
- **Response**: `201 Created`

---

## 3. Units of Measurement (UOM)

### `GET /api/v1/inventory/uom`
List units of measurement (seeded standard and custom).
- **Permission**: `INVENTORY:VIEW`

### `POST /api/v1/inventory/uom`
Create custom unit of measurement.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Body**:
  ```json
  {
    "unit_code": "ROLL",
    "unit_name": "Roll",
    "symbol": "roll",
    "unit_type": "PACKAGING",
    "decimal_places": 0
  }
  ```

### `POST /api/v1/inventory/uom/convert`
Live conversion simulation endpoint.
- **Permission**: `INVENTORY:VIEW`
- **Body**:
  ```json
  {
    "stock_item_id": "67b8...",
    "from_uom_id": "67b8...",
    "to_uom_id": "67b8...",
    "quantity": 5
  }
  ```
- **Response**:
  ```json
  {
    "source_quantity": "5",
    "target_quantity": "50",
    "conversion_factor": "10",
    "conversion_type": "ITEM_SPECIFIC",
    "from_unit": "BOX",
    "to_unit": "PCS"
  }
  ```

---

## 4. Godowns / Warehouses

### `GET /api/v1/inventory/godowns`
List godowns/warehouses.
- **Permission**: `INVENTORY:VIEW`

### `POST /api/v1/inventory/godowns`
Create warehouse/godown. If `is_default: true`, automatically unsets previous default godown.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Body**:
  ```json
  {
    "godown_code": "WH_EAST",
    "godown_name": "Eastern Regional Depot",
    "is_default": true,
    "address": { "city": "Kolkata", "state": "WB", "country": "IN" }
  }
  ```

---

## 5. Stock Items

### `GET /api/v1/inventory/items`
List stock items with pagination, text search, group filtering, and populated UOM details.
- **Permission**: `INVENTORY:VIEW`
- **Query Params**: `page`, `limit`, `search`, `stock_group_id`, `stock_category_id`, `status`.

### `POST /api/v1/inventory/items`
Create stock item with base UOM and alternate packaging ratios.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Body**:
  ```json
  {
    "item_code": "BOLT_M8",
    "sku": "SKU-BOLT-M8",
    "item_name": "M8 Stainless Steel Hex Bolt 50mm",
    "stock_group_id": "67b8...",
    "base_uom_id": "67b8...",
    "uom_conversions": [
      { "alternate_uom_id": "67b8...", "conversion_factor": "10" }
    ],
    "costing_method": "AVERAGE_COST",
    "purchase_price": "5.00",
    "sales_price": "8.50"
  }
  ```
- **Response**: `201 Created`

### `PATCH /api/v1/inventory/items/:id`
Update stock item. Base UOM is strictly immutable if stock movements have been posted.
- **Permission**: `INVENTORY:MANAGE_MASTERS`
- **Error Codes**: `BASE_UOM_IMMUTABLE_AFTER_MOVEMENTS` (400).

---

## 6. Opening Stock Entry

### `POST /api/v1/inventory/opening-stock`
Initialize opening stock quantity and valuation in target godown.
- **Permission**: `INVENTORY:OPENING_STOCK`
- **Body**:
  ```json
  {
    "stock_item_id": "67b8...",
    "godown_id": "67b8...",
    "quantity": 5,
    "uom_id": "67b8...",
    "unit_rate": 50.00,
    "total_cost": 250.00,
    "batch_number": "BATCH-01",
    "notes": "Year 2026 Opening Count"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "message": "Opening stock posted successfully",
    "movement": { ... },
    "balance": { ... },
    "gl_status": "DEFERRED_TO_PHASE_4",
    "gl_note": "Opening stock GL balancing entry deferred to Phase 4 commercial voucher engine."
  }
  ```
- **Error Codes**: `OPENING_STOCK_ALREADY_POSTED` (409), `STOCK_ITEM_INACTIVE` (400).

---

## 7. Balances & Inventory Summary

### `GET /api/v1/inventory/balances`
List projected materialized balances by item and godown.
- **Permission**: `INVENTORY:VIEW`
- **Query Params**: `stock_item_id`, `godown_id`, `non_zero_only` (boolean).

### `GET /api/v1/inventory/summary`
Valuation summary across entire company.
- **Permission**: `INVENTORY:VIEW`
- **Response**:
  ```json
  {
    "total_items_tracked": 12,
    "total_groups": 3,
    "total_godowns": 2,
    "total_quantity_on_hand": "150.0000",
    "total_inventory_valuation": "3750.00",
    "currency": "INR",
    "as_of_date": "2026-10-20T18:00:00.000Z"
  }
  ```

---

## 8. Movement Register & Reversals

### `GET /api/v1/inventory/movements`
Query append-only immutable movement ledger.
- **Permission**: `INVENTORY:VIEW`
- **Query Params**: `stock_item_id`, `godown_id`, `movement_type`, `start_date`, `end_date`.

### `POST /api/v1/inventory/movements/:id/reverse`
Reverse a previously posted movement by appending an opposite compensating movement.
- **Permission**: `INVENTORY:ADJUST`
- **Body**: `{ "reason": "Physical count audit correction" }`

---

## 9. Audit Reconciliation

### `POST /api/v1/inventory/reconcile`
Recalculate and rebuild all projected `StockBalance` records from the immutable `StockMovement` ledger.
- **Permission**: `INVENTORY:ADJUST`
- **Body**: `{ "stock_item_id": null }`
