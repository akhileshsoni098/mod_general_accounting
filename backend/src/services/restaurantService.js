const mongoose = require('mongoose');
const {
  RestaurantTable,
  RestaurantOrder,
  RecipeBOM,
  StockItem,
  Godown
} = require('../models');
const commercialDocumentService = require('./commercialDocumentService');
const { postCommercialDocument } = require('./commercialPostingService');
const { recordStockMovement } = require('./stockMovementService');

class RestaurantService {
  /**
   * Get all tables for a company
   */
  async getTables(companyId) {
    return RestaurantTable.find({ company_id: companyId }).sort({ section: 1, table_number: 1 });
  }

  /**
   * Create or upsert a table
   */
  async createTable({ tenantId, companyId, tableNumber, section = 'MAIN_HALL', capacity = 4 }) {
    return RestaurantTable.findOneAndUpdate(
      { company_id: companyId, table_number: tableNumber.toUpperCase() },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          table_number: tableNumber.toUpperCase(),
          section: section.toUpperCase(),
          capacity: Number(capacity)
        }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Create or update recipe BOM for a menu item
   */
  async saveRecipeBOM({
    tenantId,
    companyId,
    menuItemId,
    variantName = 'STANDARD',
    yieldQuantity = 1,
    yieldUomId,
    ingredients
  }) {
    return RecipeBOM.findOneAndUpdate(
      {
        company_id: companyId,
        menu_item_id: menuItemId,
        variant_name: variantName.toUpperCase()
      },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          menu_item_id: menuItemId,
          variant_name: variantName.toUpperCase(),
          yield_quantity: yieldQuantity,
          yield_uom_id: yieldUomId,
          ingredients,
          is_active: true
        }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Get recipe BOM for a menu item
   */
  async getRecipeBOM(companyId, menuItemId, variantName = 'STANDARD') {
    return RecipeBOM.findOne({
      company_id: companyId,
      menu_item_id: menuItemId,
      variant_name: variantName.toUpperCase(),
      is_active: true
    }).populate('ingredients.ingredient_item_id ingredients.uom_id');
  }

  /**
   * Create or update a restaurant order
   */
  async createOrder({
    tenantId,
    companyId,
    userId,
    tableId = null,
    orderType = 'DINE_IN',
    customerName = 'Guest',
    customerPhone = '',
    items
  }) {
    const orderCount = await RestaurantOrder.countDocuments({ company_id: companyId });
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${String(orderCount + 1).padStart(3, '0')}`;

    let subtotal = 0;
    let taxTotal = 0;
    const formattedItems = [];

    for (const it of items) {
      const qty = Number(it.quantity);
      const price = Number(it.unit_price);
      const lineTotal = qty * price;
      const taxAmt = lineTotal * 0.05; // 5% GST standard restaurant rate
      subtotal += lineTotal;
      taxTotal += taxAmt;

      formattedItems.push({
        item_id: it.item_id,
        item_name: it.item_name,
        variant_name: it.variant_name || 'STANDARD',
        modifiers: it.modifiers || [],
        quantity: qty,
        unit_price: price,
        tax_amount: taxAmt,
        line_total: lineTotal,
        kot_number: `KOT-${orderNumber.slice(-4)}`,
        kot_status: 'PENDING'
      });
    }

    const order = await RestaurantOrder.create({
      tenant_id: tenantId,
      company_id: companyId,
      order_number: orderNumber,
      order_type: orderType,
      table_id: tableId,
      customer_name: customerName,
      customer_phone: customerPhone,
      status: 'CONFIRMED',
      items: formattedItems,
      subtotal,
      tax_total: taxTotal,
      discount_total: 0,
      grand_total: subtotal + taxTotal,
      created_by: userId
    });

    if (tableId) {
      await RestaurantTable.findByIdAndUpdate(tableId, {
        $set: { status: 'OCCUPIED', current_order_id: order._id }
      });
    }

    return order;
  }

  /**
   * Send order items to kitchen (KOT generation)
   */
  async sendOrderToKitchen(orderId) {
    const order = await RestaurantOrder.findById(orderId);
    if (!order) throw new Error('Order not found');

    for (const item of order.items) {
      if (item.kot_status === 'PENDING') {
        item.kot_status = 'SENT_TO_KITCHEN';
      }
    }
    order.status = 'KITCHEN_IN_PROGRESS';
    await order.save();
    return order;
  }

  /**
   * Finalize order, post commercial sales invoice, and automatically consume raw ingredients
   */
  async settleAndBillOrder({ orderId, userId, godownId = null }) {
    const order = await RestaurantOrder.findById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'COMPLETED') throw new Error('Order is already settled and billed.');

    const defaultGodown = godownId
      ? await Godown.findById(godownId)
      : await Godown.findOne({ company_id: order.company_id, is_active: true });

    if (!defaultGodown) {
      throw new Error('Active godown required for kitchen ingredient consumption.');
    }

    // 1. Create and Post Commercial Document for the sale
    const docLines = order.items.map((it, idx) => ({
      line_number: idx + 1,
      line_type: 'SERVICES', // Menu dishes sold in restaurant are service supplies under GST
      item_id: it.item_id,
      item_name: it.item_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      tax_rate_code: 'GST_5'
    }));

    const draft = await commercialDocumentService.createDraftDocument({
      tenant_id: order.tenant_id,
      company_id: order.company_id,
      document_type: 'SALES_INVOICE',
      sub_type: 'TAX_INVOICE',
      billing_name: order.customer_name,
      customer_phone: order.customer_phone,
      lines: docLines,
      metadata: {
        restaurant_order_number: order.order_number,
        restaurant_order_id: order._id,
        table_id: order.table_id
      },
      created_by: userId
    });

    const postingResult = await postCommercialDocument({
      tenantId: order.tenant_id,
      companyId: order.company_id,
      documentId: draft._id,
      userId
    });
    const postedDoc = postingResult.document;

    // 2. Consume Raw Ingredients based on Recipe BOM
    const consumedIngredients = [];
    for (const item of order.items) {
      const bom = await RecipeBOM.findOne({
        company_id: order.company_id,
        menu_item_id: item.item_id,
        variant_name: item.variant_name || 'STANDARD',
        is_active: true
      });

      if (bom && bom.ingredients && bom.ingredients.length > 0) {
        for (const ing of bom.ingredients) {
          const wasteFactor = 1 + (ing.waste_percentage || 0) / 100;
          const totalConsumeQty = (Number(ing.quantity) / (bom.yield_quantity || 1)) * Number(item.quantity) * wasteFactor;

          const movementResult = await recordStockMovement({
            tenantId: order.tenant_id,
            companyId: order.company_id,
            stockItemId: ing.ingredient_item_id,
            godownId: defaultGodown._id,
            movementType: 'RECIPE_CONSUMPTION',
            direction: 'OUT',
            quantity: totalConsumeQty,
            uomId: ing.uom_id,
            idempotencyKey: `REST-CONSUME-${order.order_number}-${item.item_id}-${ing.ingredient_item_id}`,
            sourceDocumentType: 'RESTAURANT_ORDER',
            sourceDocumentId: order.order_number,
            notes: `Auto-consumed for order ${order.order_number} (${item.item_name})`,
            userId
          });

          consumedIngredients.push({
            ingredient_item_id: ing.ingredient_item_id,
            quantity: totalConsumeQty,
            balance: movementResult.balance
          });
        }
      }
    }

    // 3. Mark Table Vacant and Order Completed
    if (order.table_id) {
      await RestaurantTable.findByIdAndUpdate(order.table_id, {
        $set: { status: 'VACANT', current_order_id: null }
      });
    }

    order.status = 'COMPLETED';
    order.commercial_document_id = postedDoc._id;
    order.ingredients_consumed = true;
    await order.save();

    return {
      order,
      commercial_document: postedDoc,
      consumed_ingredients: consumedIngredients
    };
  }
}

module.exports = new RestaurantService();
