const restaurantService = require('../services/restaurantService');
const { RestaurantOrder } = require('../models');

class RestaurantController {
  async getTables(req, res) {
    try {
      const tables = await restaurantService.getTables(req.companyId);
      return res.success(tables);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createTable(req, res) {
    try {
      const { table_number, section, capacity } = req.body;
      const table = await restaurantService.createTable({
        tenantId: req.tenantId,
        companyId: req.companyId,
        tableNumber: table_number,
        section,
        capacity
      });
      return res.success(table);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

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

  async getOrders(req, res) {
    try {
      const orders = await RestaurantOrder.find({ company_id: req.companyId })
        .populate('table_id')
        .sort({ created_at: -1 })
        .limit(50);
      return res.success(orders);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createOrder(req, res) {
    try {
      const {
        table_id,
        order_type,
        customer_name,
        customer_phone,
        items
      } = req.body;

      const order = await restaurantService.createOrder({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        tableId: table_id,
        orderType: order_type,
        customerName: customer_name,
        customerPhone: customer_phone,
        items
      });
      return res.success(order);
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
      const { godown_id } = req.body;
      const result = await restaurantService.settleAndBillOrder({
        orderId,
        userId: req.user._id,
        godownId: godown_id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new RestaurantController();
