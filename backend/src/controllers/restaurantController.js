const restaurantService = require('../services/restaurantService');
const { RestaurantOrder } = require('../models');

class RestaurantController {
  // ==========================================
  // LOCATIONS / OUTLETS
  // ==========================================
  async getLocations(req, res) {
    try {
      const locations = await restaurantService.getLocations(req.companyId);
      return res.success(locations);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async saveLocation(req, res) {
    try {
      const {
        location_id,
        name,
        location_code,
        slug,
        address,
        phone,
        email,
        enabled_channels,
        kiosk_settings,
        kitchen_stations,
        default_godown_id,
        default_pos_cash_account_id,
        default_tax_rate_id
      } = req.body;

      const location = await restaurantService.saveLocation({
        tenantId: req.tenantId,
        companyId: req.companyId,
        locationId: location_id,
        name,
        locationCode: location_code,
        slug,
        address,
        phone,
        email,
        enabledChannels: enabled_channels,
        kioskSettings: kiosk_settings,
        kitchenStations: kitchen_stations,
        defaultGodownId: default_godown_id,
        defaultPosCashAccountId: default_pos_cash_account_id,
        defaultTaxRateId: default_tax_rate_id
      });
      return res.success(location, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async archiveLocation(req, res) {
    try {
      const { locationId } = req.params;
      const result = await restaurantService.archiveLocation(req.companyId, locationId);
      return res.success({ message: 'Location archived', result });
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // RESTAURANT CONFIGURATION
  // ==========================================
  async getConfig(req, res) {
    try {
      const { locationId } = req.query;
      const config = await restaurantService.getEffectiveRestaurantConfig(
        req.tenantId,
        req.companyId,
        locationId
      );
      return res.success(config);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async saveConfig(req, res) {
    try {
      const { location_id, ...configData } = req.body;
      const config = await restaurantService.saveRestaurantConfig({
        tenantId: req.tenantId,
        companyId: req.companyId,
        locationId: location_id,
        configData
      });
      return res.success(config);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // MODIFIER GROUPS
  // ==========================================
  async getModifierGroups(req, res) {
    try {
      const groups = await restaurantService.getModifierGroups(req.companyId);
      return res.success(groups);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async saveModifierGroup(req, res) {
    try {
      const {
        group_id,
        name,
        display_name,
        selection_type,
        min_selections,
        max_selections,
        is_required,
        allow_multiple_quantities,
        options,
        applicable_item_ids
      } = req.body;

      const group = await restaurantService.saveModifierGroup({
        tenantId: req.tenantId,
        companyId: req.companyId,
        groupId: group_id,
        name,
        displayName: display_name,
        selectionType: selection_type,
        minSelections: min_selections,
        maxSelections: max_selections,
        isRequired: is_required,
        allowMultipleQuantities: allow_multiple_quantities,
        options,
        applicableItemIds: applicable_item_ids
      });
      return res.success(group, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async archiveModifierGroup(req, res) {
    try {
      const { groupId } = req.params;
      const result = await restaurantService.archiveModifierGroup(req.companyId, groupId);
      return res.success({ message: 'Modifier group archived', result });
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // PRODUCT VARIANTS
  // ==========================================
  async getProductVariants(req, res) {
    try {
      const { baseItemId } = req.query;
      const variants = await restaurantService.getProductVariants(req.companyId, baseItemId);
      return res.success(variants);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async saveProductVariant(req, res) {
    try {
      const { variant_id, base_item_id, variant_name, sku, price_adjustment, recipe_bom_id } = req.body;
      const variant = await restaurantService.saveProductVariant({
        tenantId: req.tenantId,
        companyId: req.companyId,
        variantId: variant_id,
        baseItemId: base_item_id,
        variantName: variant_name,
        sku,
        priceAdjustment: price_adjustment,
        recipeBomId: recipe_bom_id
      });
      return res.success(variant, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async archiveProductVariant(req, res) {
    try {
      const { variantId } = req.params;
      const result = await restaurantService.archiveProductVariant(req.companyId, variantId);
      return res.success({ message: 'Product variant archived', result });
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // TABLES & QR
  // ==========================================
  async getTables(req, res) {
    try {
      const { locationId } = req.query;
      const tables = await restaurantService.getTables(req.companyId, locationId);
      return res.success(tables);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createTable(req, res) {
    try {
      const { table_number, section, capacity, seating_capacity, location_id } = req.body;
      const table = await restaurantService.createTable({
        tenantId: req.tenantId,
        companyId: req.companyId,
        locationId: location_id,
        tableNumber: table_number,
        section,
        capacity: capacity || seating_capacity || 4
      });
      return res.success(table, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async generateTableQr(req, res) {
    try {
      const { tableId } = req.params;
      const result = await restaurantService.generateTableQrToken(req.companyId, tableId);
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // PUBLIC KIOSK & TABLE QR (NO AUTH REQUIRED)
  // ==========================================
  async getKioskCatalog(req, res) {
    try {
      const { tenantSlug, outletSlug } = req.params;
      const data = await restaurantService.getKioskData(tenantSlug, outletSlug);
      return res.success(data);
    } catch (err) {
      return res.error(err.message, 404);
    }
  }

  async submitKioskOrder(req, res) {
    try {
      const { tenantSlug, outletSlug } = req.params;
      const {
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        order_type,
        items,
        payment_details
      } = req.body;

      const result = await restaurantService.submitKioskOrder({
        tenantSlug,
        outletSlug,
        customerName: customer_name,
        customerPhone: customer_phone,
        customerEmail: customer_email,
        customerAddress: customer_address,
        orderType: order_type,
        items,
        paymentDetails: payment_details
      });
      return res.success(result, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getTableCatalog(req, res) {
    try {
      const { qrToken } = req.params;
      const table = await restaurantService.getTableByQrToken(qrToken);
      const data = await restaurantService.getKioskData(
        table.tenant_id.tenant_code || table.tenant_id._id,
        table.location_id?.slug || table.location_id?._id || 'default'
      );
      data.table = table;
      return res.success(data);
    } catch (err) {
      return res.error(err.message, 404);
    }
  }

  async submitTableOrder(req, res) {
    try {
      const { qrToken } = req.params;
      const table = await restaurantService.getTableByQrToken(qrToken);
      const {
        customer_name,
        customer_phone,
        items,
        payment_details
      } = req.body;

      const result = await restaurantService.submitKioskOrder({
        tenantSlug: table.tenant_id.tenant_code || table.tenant_id._id.toString(),
        outletSlug: table.location_id?.slug || table.location_id?._id.toString() || 'default',
        customerName: customer_name,
        customerPhone: customer_phone,
        orderType: 'DINE_IN',
        items,
        paymentDetails: payment_details
      });

      // Link order to table
      result.order.table_id = table._id;
      await result.order.save();
      table.status = 'OCCUPIED';
      table.current_order_id = result.order._id;
      await table.save();

      return res.success(result, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // KITCHEN DISPLAY SYSTEM (KDS)
  // ==========================================
  async getKdsOrders(req, res) {
    try {
      const { station, location_id } = req.query;
      const orders = await restaurantService.getKdsOrders(req.companyId, {
        station,
        locationId: location_id
      });
      return res.success(orders);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async updateKdsItemStatus(req, res) {
    try {
      const { orderId, itemId } = req.params;
      const { status } = req.body;
      const order = await restaurantService.updateKdsItemStatus({
        companyId: req.companyId,
        orderId,
        itemId,
        stationStatus: status
      });
      return res.success(order);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // RECIPES
  // ==========================================
  async saveRecipe(req, res) {
    try {
      const {
        menu_item_id,
        variant_name,
        yield_quantity,
        yield_uom_id,
        ingredients
      } = req.body;

      const recipe = await restaurantService.saveRecipeBOM({
        tenantId: req.tenantId,
        companyId: req.companyId,
        menuItemId: menu_item_id,
        variantName: variant_name,
        yieldQuantity: yield_quantity,
        yieldUomId: yield_uom_id,
        ingredients
      });
      return res.success(recipe);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getRecipes(req, res) {
    try {
      const recipes = await restaurantService.getRecipes(req.companyId);
      return res.success(recipes);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getRecipe(req, res) {
    try {
      const { menuItemId } = req.params;
      const { variant } = req.query;
      const recipe = await restaurantService.getRecipeBOM(req.companyId, menuItemId, variant);
      return res.success(recipe);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async archiveRecipe(req, res) {
    try {
      const { recipeId } = req.params;
      const recipe = await restaurantService.archiveRecipeBOM(req.companyId, recipeId);
      return res.success({ message: 'Recipe archived', recipe });
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  // ==========================================
  // GENERAL ORDERS (ADMIN / POS)
  // ==========================================
  async getOrders(req, res) {
    try {
      const { locationId, status } = req.query;
      const filter = { company_id: req.companyId };
      if (locationId) filter.location_id = locationId;
      if (status) filter.status = status;

      const orders = await RestaurantOrder.find(filter)
        .populate('table_id location_id')
        .sort({ created_at: -1 })
        .limit(100);
      return res.success(orders);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createOrder(req, res) {
    try {
      const {
        location_id,
        order_channel,
        table_id,
        order_type,
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        items
      } = req.body;

      const order = await restaurantService.createOrder({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        locationId: location_id,
        orderChannel: order_channel || 'POS',
        tableId: table_id,
        orderType: order_type,
        customerName: customer_name,
        customerPhone: customer_phone,
        customerEmail: customer_email,
        customerAddress: customer_address,
        items
      });
      return res.success(order, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async sendToKitchen(req, res) {
    try {
      const { orderId } = req.params;
      const order = await restaurantService.sendOrderToKitchen(orderId);
      return res.success(order);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async settleOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { godown_id, payment_details } = req.body;
      const result = await restaurantService.settleAndBillOrder({
        orderId,
        userId: req.user._id,
        godownId: godown_id,
        paymentDetails: payment_details
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async cancelOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { reason = 'Order cancelled by user', auto_reverse = true } = req.body;
      const result = await restaurantService.cancelOrder({
        orderId,
        userId: req.user._id,
        reason,
        autoReverse: auto_reverse
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async deleteOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { reason = 'Order deleted by user' } = req.body;
      const result = await restaurantService.deleteOrder({
        orderId,
        userId: req.user._id,
        reason
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new RestaurantController();
