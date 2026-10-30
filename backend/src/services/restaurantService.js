const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  Tenant,
  Company,
  RestaurantTable,
  RestaurantOrder,
  RecipeBOM,
  StockItem,
  Godown,
  StockMovement,
  StockBalance,
  StoreLocation,
  RestaurantConfig,
  ModifierGroup,
  ProductVariant,
  TaxRateConfig
} = require('../models');
const commercialDocumentService = require('./commercialDocumentService');
const { postCommercialDocument } = require('./commercialPostingService');
const { reverseCommercialDocument } = require('./commercialReversalService');
const { recordStockMovement, reverseStockMovement } = require('./stockMovementService');

class RestaurantService {
  // ==========================================
  // 1. STORE LOCATION / OUTLET MANAGEMENT
  // ==========================================

  async getLocations(companyId) {
    return StoreLocation.find({ company_id: companyId, is_active: true })
      .populate('default_godown_id default_tax_rate_id')
      .sort({ name: 1 });
  }

  async getLocationById(companyId, locationId) {
    return StoreLocation.findOne({ _id: locationId, company_id: companyId, is_active: true })
      .populate('default_godown_id default_tax_rate_id');
  }

  async saveLocation({
    tenantId,
    companyId,
    locationId = null,
    name,
    locationCode,
    slug,
    address = {},
    phone = '',
    email = '',
    enabledChannels = ['POS', 'KIOSK', 'TABLE_QR'],
    kioskSettings = {},
    kitchenStations = [],
    defaultGodownId = null,
    defaultPosCashAccountId = null,
    defaultTaxRateId = null
  }) {
    const formattedCode = locationCode.toUpperCase().trim();
    const formattedSlug = (slug || locationCode).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');

    const updateData = {
      tenant_id: tenantId,
      company_id: companyId,
      name: name.trim(),
      location_code: formattedCode,
      slug: formattedSlug,
      address,
      phone,
      email,
      enabled_channels: enabledChannels,
      kiosk_settings: kioskSettings,
      kitchen_stations: kitchenStations.length > 0 ? kitchenStations : [
        { station_code: 'OVEN', station_name: 'Pizza Oven Station', display_color: '#ea580c' },
        { station_code: 'HOT_KITCHEN', station_name: 'Hot Kitchen & Fryers', display_color: '#dc2626' },
        { station_code: 'BEVERAGE', station_name: 'Beverage & Bar', display_color: '#0284c7' }
      ],
      default_godown_id: defaultGodownId,
      default_pos_cash_account_id: defaultPosCashAccountId,
      default_tax_rate_id: defaultTaxRateId,
      is_active: true
    };

    if (locationId) {
      return StoreLocation.findOneAndUpdate(
        { _id: locationId, company_id: companyId },
        { $set: updateData },
        { new: true }
      );
    } else {
      return StoreLocation.findOneAndUpdate(
        { company_id: companyId, location_code: formattedCode },
        { $set: updateData },
        { upsert: true, new: true }
      );
    }
  }

  async archiveLocation(companyId, locationId) {
    const loc = await StoreLocation.findOne({ _id: locationId, company_id: companyId });
    if (!loc) throw new Error('Location not found');
    loc.is_active = false;
    await loc.save();
    return loc;
  }

  // ==========================================
  // 2. RESTAURANT CONFIGURATION MANAGEMENT
  // ==========================================

  async getRestaurantConfig(companyId, locationId = null) {
    const filter = { company_id: companyId };
    if (locationId) {
      filter.location_id = locationId;
    } else {
      filter.location_id = null;
    }
    return RestaurantConfig.findOne(filter);
  }

  async getEffectiveRestaurantConfig(tenantId, companyId, locationId = null) {
    let config = null;
    if (locationId) {
      config = await RestaurantConfig.findOne({ company_id: companyId, location_id: locationId });
    }
    if (!config) {
      config = await RestaurantConfig.findOne({ company_id: companyId, location_id: null });
    }

    if (config) {
      return config.toObject ? config.toObject() : config;
    }

    // Default configuration if not configured in DB yet
    return {
      operating_mode: 'QSR_KIOSK',
      customer_info_policy: {
        name: 'REQUIRED',
        phone: 'REQUIRED',
        email: 'OPTIONAL',
        address: 'OPTIONAL',
        allow_anonymous_walkin: false
      },
      modifier_rules: {
        allow_ingredient_removal: true,
        removals_reduce_price: false,
        allow_chargeable_add_ons: true,
        max_add_ons_per_item: 10
      },
      payment_policy: {
        default_method: 'UPI_DYNAMIC_QR',
        allowed_methods: ['UPI_DYNAMIC_QR', 'CASH', 'CARD'],
        pay_before_order: true,
        enable_instant_refund_on_cancel: true
      },
      order_dispatch_policy: {
        auto_send_kds: true,
        print_kot_on_payment: true,
        pickup_number_format: 'P-{SEQ}'
      }
    };
  }

  async saveRestaurantConfig({ tenantId, companyId, locationId = null, configData }) {
    const filter = { company_id: companyId, location_id: locationId || null };
    const update = {
      tenant_id: tenantId,
      company_id: companyId,
      location_id: locationId || null,
      operating_mode: configData.operating_mode || 'QSR_KIOSK',
      customer_info_policy: {
        name: configData.customer_info_policy?.name || 'REQUIRED',
        phone: configData.customer_info_policy?.phone || 'REQUIRED',
        email: configData.customer_info_policy?.email || 'OPTIONAL',
        address: configData.customer_info_policy?.address || 'OPTIONAL',
        allow_anonymous_walkin: Boolean(configData.customer_info_policy?.allow_anonymous_walkin)
      },
      modifier_rules: {
        allow_ingredient_removal: configData.modifier_rules?.allow_ingredient_removal !== false,
        removals_reduce_price: Boolean(configData.modifier_rules?.removals_reduce_price),
        allow_chargeable_add_ons: configData.modifier_rules?.allow_chargeable_add_ons !== false,
        max_add_ons_per_item: configData.modifier_rules?.max_add_ons_per_item || 10
      },
      payment_policy: {
        default_method: configData.payment_policy?.default_method || 'UPI_DYNAMIC_QR',
        allowed_methods: configData.payment_policy?.allowed_methods || ['UPI_DYNAMIC_QR', 'CASH', 'CARD'],
        pay_before_order: configData.payment_policy?.pay_before_order !== false,
        enable_instant_refund_on_cancel: Boolean(configData.payment_policy?.enable_instant_refund_on_cancel)
      },
      order_dispatch_policy: {
        auto_send_kds: configData.order_dispatch_policy?.auto_send_kds !== false,
        print_kot_on_payment: configData.order_dispatch_policy?.print_kot_on_payment !== false,
        pickup_number_format: configData.order_dispatch_policy?.pickup_number_format || 'P-{SEQ}'
      }
    };

    return RestaurantConfig.findOneAndUpdate(filter, { $set: update }, { upsert: true, new: true });
  }

  // ==========================================
  // 3. MODIFIER GROUPS & PRODUCT VARIANTS
  // ==========================================

  async getModifierGroups(companyId) {
    return ModifierGroup.find({ company_id: companyId, is_active: true })
      .populate('options.ingredient_item_id options.uom_id applicable_item_ids')
      .sort({ display_name: 1 });
  }

  async saveModifierGroup({
    tenantId,
    companyId,
    groupId = null,
    name,
    displayName,
    selectionType = 'MULTIPLE',
    minSelections = 0,
    maxSelections = 5,
    isRequired = false,
    allowMultipleQuantities = false,
    options = [],
    applicableItemIds = []
  }) {
    const updateData = {
      tenant_id: tenantId,
      company_id: companyId,
      name: name.toUpperCase().trim(),
      display_name: displayName.trim(),
      selection_type: selectionType,
      min_selections: Number(minSelections),
      max_selections: Number(maxSelections),
      is_required: Boolean(isRequired),
      allow_multiple_quantities: Boolean(allowMultipleQuantities),
      options: options.map(opt => ({
        name: opt.name.trim(),
        price_adjustment: Number(opt.price_adjustment || 0),
        ingredient_item_id: opt.ingredient_item_id || null,
        quantity_to_consume: Number(opt.quantity_to_consume || 0),
        uom_id: opt.uom_id || null,
        is_default: Boolean(opt.is_default)
      })),
      applicable_item_ids: applicableItemIds,
      is_active: true
    };

    if (groupId) {
      return ModifierGroup.findOneAndUpdate(
        { _id: groupId, company_id: companyId },
        { $set: updateData },
        { new: true }
      );
    } else {
      return ModifierGroup.create(updateData);
    }
  }

  async archiveModifierGroup(companyId, groupId) {
    const group = await ModifierGroup.findOne({ _id: groupId, company_id: companyId });
    if (!group) throw new Error('Modifier group not found');
    group.is_active = false;
    await group.save();
    return group;
  }

  async getProductVariants(companyId, baseItemId = null) {
    const filter = { company_id: companyId, is_active: true };
    if (baseItemId) filter.base_item_id = baseItemId;
    return ProductVariant.find(filter).populate('base_item_id recipe_bom_id').sort({ variant_name: 1 });
  }

  async saveProductVariant({
    tenantId,
    companyId,
    variantId = null,
    baseItemId,
    variantName,
    sku = '',
    priceAdjustment = 0,
    recipeBomId = null
  }) {
    const updateData = {
      tenant_id: tenantId,
      company_id: companyId,
      base_item_id: baseItemId,
      variant_name: variantName.toUpperCase().trim(),
      sku: sku.trim(),
      price_adjustment: Number(priceAdjustment),
      recipe_bom_id: recipeBomId || null,
      is_active: true
    };

    if (variantId) {
      return ProductVariant.findOneAndUpdate(
        { _id: variantId, company_id: companyId },
        { $set: updateData },
        { new: true }
      );
    } else {
      return ProductVariant.findOneAndUpdate(
        { company_id: companyId, base_item_id: baseItemId, variant_name: updateData.variant_name },
        { $set: updateData },
        { upsert: true, new: true }
      );
    }
  }

  async archiveProductVariant(companyId, variantId) {
    const variant = await ProductVariant.findOne({ _id: variantId, company_id: companyId });
    if (!variant) throw new Error('Product variant not found');
    variant.is_active = false;
    await variant.save();
    return variant;
  }

  // ==========================================
  // 4. RESTAURANT TABLES & QR MANAGEMENT
  // ==========================================

  async getTables(companyId, locationId = null) {
    const filter = { company_id: companyId, is_active: true };
    if (locationId) filter.location_id = locationId;
    return RestaurantTable.find(filter)
      .populate('location_id')
      .sort({ section: 1, table_number: 1 });
  }

  async createTable({
    tenantId,
    companyId,
    locationId = null,
    tableNumber,
    section = 'MAIN_HALL',
    capacity = 4
  }) {
    const formattedNumber = tableNumber.toUpperCase().trim();
    const token = crypto.randomBytes(12).toString('hex');

    let effectiveLocationId = locationId;
    if (!effectiveLocationId) {
      const defLoc = await StoreLocation.findOne({ company_id: companyId, is_active: true });
      if (defLoc) effectiveLocationId = defLoc._id;
    }

    return RestaurantTable.findOneAndUpdate(
      { company_id: companyId, table_number: formattedNumber },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          location_id: effectiveLocationId || null,
          table_number: formattedNumber,
          section: section.toUpperCase().trim(),
          capacity: Number(capacity),
          table_qr_token: token,
          is_active: true
        }
      },
      { upsert: true, new: true }
    );
  }

  async generateTableQrToken(companyId, tableId) {
    const table = await RestaurantTable.findOne({ _id: tableId, company_id: companyId });
    if (!table) throw new Error('Table not found');
    const token = crypto.randomBytes(12).toString('hex');
    table.table_qr_token = token;
    await table.save();
    return { table, qr_token: token };
  }

  async getTableByQrToken(qrToken) {
    const table = await RestaurantTable.findOne({ table_qr_token: qrToken, is_active: true })
      .populate('tenant_id company_id location_id');
    if (!table) throw new Error('Invalid or revoked table QR code.');
    return table;
  }

  // ==========================================
  // 5. RECIPE BOM MANAGEMENT
  // ==========================================

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
        variant_name: variantName.toUpperCase().trim()
      },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          menu_item_id: menuItemId,
          variant_name: variantName.toUpperCase().trim(),
          yield_quantity: yieldQuantity,
          yield_uom_id: yieldUomId,
          ingredients,
          is_active: true
        }
      },
      { upsert: true, new: true }
    );
  }

  async getRecipes(companyId) {
    return RecipeBOM.find({ company_id: companyId, is_active: true })
      .populate('menu_item_id yield_uom_id ingredients.ingredient_item_id ingredients.uom_id')
      .sort({ created_at: -1 });
  }

  async getRecipeBOM(companyId, menuItemId, variantName = 'STANDARD') {
    return RecipeBOM.findOne({
      company_id: companyId,
      menu_item_id: menuItemId,
      variant_name: (variantName || 'STANDARD').toUpperCase().trim(),
      is_active: true
    }).populate('menu_item_id yield_uom_id ingredients.ingredient_item_id ingredients.uom_id');
  }

  async archiveRecipeBOM(companyId, recipeId) {
    const recipe = await RecipeBOM.findOne({ _id: recipeId, company_id: companyId });
    if (!recipe) throw new Error('Recipe not found');
    recipe.is_active = false;
    await recipe.save();
    return recipe;
  }

  // ==========================================
  // 6. PUBLIC KIOSK DATA & ORDER SUBMISSION
  // ==========================================

  async resolveOutletBySlugs(tenantSlug, outletSlug) {
    // Resolve Tenant by tenant_code or id
    const tenantQuery = mongoose.isValidObjectId(tenantSlug)
      ? { _id: tenantSlug }
      : { tenant_code: tenantSlug.toUpperCase() };
    const tenant = await Tenant.findOne(tenantQuery);
    if (!tenant) throw new Error(`Tenant '${tenantSlug}' not found.`);

    // If outletSlug is 'default' or null/empty, resolve first active location for tenant
    if (!outletSlug || outletSlug === 'default') {
      const location = await StoreLocation.findOne({ tenant_id: tenant._id, is_active: true }).populate('company_id');
      if (location) {
        return { tenant, company: location.company_id, location };
      }
    }

    // Resolve StoreLocation by slug or location_code
    const locationQuery = {
      tenant_id: tenant._id,
      is_active: true
    };
    if (mongoose.isValidObjectId(outletSlug)) {
      locationQuery._id = outletSlug;
    } else {
      locationQuery.$or = [
        { slug: outletSlug.toLowerCase() },
        { location_code: outletSlug.toUpperCase() }
      ];
    }

    let location = await StoreLocation.findOne(locationQuery).populate('company_id');
    if (!location) {
      // Fallback to first active outlet if specific outlet not matched
      location = await StoreLocation.findOne({ tenant_id: tenant._id, is_active: true }).populate('company_id');
    }
    if (!location) throw new Error(`Store Outlet '${outletSlug}' not found for tenant.`);

    const company = location.company_id;
    return { tenant, company, location };
  }

  async getKioskData(tenantSlug, outletSlug) {
    const { tenant, company, location } = await this.resolveOutletBySlugs(tenantSlug, outletSlug);
    const config = await this.getEffectiveRestaurantConfig(tenant._id, company._id, location._id);

    // Fetch active menu items (StockItems for this company)
    const menuItems = await StockItem.find({
      company_id: company._id,
      status: { $ne: 'ARCHIVED' }
    })
      .populate('base_uom_id stock_group_id')
      .sort({ item_name: 1 });

    // Fetch active variants for these items
    const variants = await ProductVariant.find({ company_id: company._id, is_active: true });

    // Fetch active modifier groups
    const modifierGroups = await ModifierGroup.find({ company_id: company._id, is_active: true })
      .populate('options.ingredient_item_id');

    // Fetch active recipes to know customizable ingredients
    const recipes = await RecipeBOM.find({ company_id: company._id, is_active: true })
      .populate('ingredients.ingredient_item_id');

    return {
      outlet: {
        _id: location._id,
        name: location.name,
        location_code: location.location_code,
        slug: location.slug,
        address: location.address,
        phone: location.phone,
        enabled_channels: location.enabled_channels,
        kiosk_settings: location.kiosk_settings,
        kitchen_stations: location.kitchen_stations
      },
      tenant: {
        _id: tenant._id,
        tenant_code: tenant.tenant_code,
        name: tenant.name,
        base_currency: tenant.base_currency || 'INR'
      },
      company: {
        _id: company._id,
        name: company.name
      },
      config,
      menu_items: menuItems,
      variants,
      modifier_groups: modifierGroups,
      recipes
    };
  }

  /**
   * Pre-validates that sufficient raw ingredients and stock exist to fulfill an order.
   * If any required raw material (from Recipe BOM) or direct item has insufficient stock,
   * throws a descriptive error so that stock will never be negative.
   */
  async validateOrderStockAvailability({ companyId, items, locationId = null }) {
    if (!Array.isArray(items) || items.length === 0) return;

    let activeGodown = null;
    if (locationId) {
      const loc = await StoreLocation.findById(locationId);
      if (loc && loc.default_godown_id) {
        activeGodown = await Godown.findById(loc.default_godown_id);
      }
    }
    if (!activeGodown) {
      activeGodown = await Godown.findOne({ company_id: companyId, is_default: true, status: 'ACTIVE' })
        || await Godown.findOne({ company_id: companyId, status: 'ACTIVE' });
    }

    const requiredQuantities = new Map();

    for (const it of items) {
      const itemId = it.item_id || it.stock_item_id;
      if (!itemId) continue;

      const orderQty = Math.max(1, Number(it.quantity || 1));

      // Check if item has a Recipe BOM
      let bom = await RecipeBOM.findOne({
        company_id: companyId,
        menu_item_id: itemId,
        variant_name: it.variant_name || 'STANDARD',
        is_active: true
      });
      if (!bom && it.variant_name && it.variant_name !== 'STANDARD') {
        bom = await RecipeBOM.findOne({
          company_id: companyId,
          menu_item_id: itemId,
          variant_name: 'STANDARD',
          is_active: true
        }) || await RecipeBOM.findOne({
          company_id: companyId,
          menu_item_id: itemId,
          is_active: true
        });
      }

      if (bom && Array.isArray(bom.ingredients) && bom.ingredients.length > 0) {
        const excludedSet = new Set((it.excluded_ingredients || []).map(id => String(id)));
        for (const ing of bom.ingredients) {
          if (excludedSet.has(String(ing.ingredient_item_id))) continue;

          const wasteFactor = 1 + (ing.waste_percentage || 0) / 100;
          const consumeQty = (Number(ing.quantity) / (bom.yield_quantity || 1)) * orderQty * wasteFactor;
          const ingIdStr = String(ing.ingredient_item_id);

          const existing = requiredQuantities.get(ingIdStr) || { required: 0, isRaw: true };
          existing.required += consumeQty;
          requiredQuantities.set(ingIdStr, existing);
        }
      } else {
        const directIdStr = String(itemId);
        const existing = requiredQuantities.get(directIdStr) || { required: 0, isRaw: false };
        existing.required += orderQty;
        requiredQuantities.set(directIdStr, existing);
      }

      // Add-on modifiers (e.g. Extra Cheese)
      if (Array.isArray(it.selected_modifiers)) {
        for (const mod of it.selected_modifiers) {
          if (mod.ingredient_item_id && Number(mod.quantity_to_consume) > 0) {
            const modQty = Number(mod.quantity_to_consume) * Number(mod.quantity || 1) * orderQty;
            const modIdStr = String(mod.ingredient_item_id);
            const existing = requiredQuantities.get(modIdStr) || { required: 0, isRaw: true };
            existing.required += modQty;
            requiredQuantities.set(modIdStr, existing);
          }
        }
      }
    }

    // Verify on-hand stock for all required items
    for (const [stockItemId, req] of requiredQuantities.entries()) {
      const stockItem = await StockItem.findOne({ _id: stockItemId, company_id: companyId }).populate('base_uom_id');
      if (!stockItem) continue;

      let balance = null;
      if (activeGodown) {
        balance = await StockBalance.findOne({
          company_id: companyId,
          stock_item_id: stockItemId,
          godown_id: activeGodown._id
        });
      }
      if (!balance) {
        const balances = await StockBalance.find({
          company_id: companyId,
          stock_item_id: stockItemId
        });
        const totalOnHand = balances.reduce((sum, b) => sum + (b.quantity_on_hand ? Number(b.quantity_on_hand.toString()) : 0), 0);
        balance = { quantity_on_hand: totalOnHand };
      }

      const availableQty = balance && balance.quantity_on_hand ? Number(balance.quantity_on_hand.toString()) : 0;
      if (availableQty < req.required) {
        const uomCode = stockItem.base_uom_id?.unit_code || 'units';
        const label = req.isRaw ? 'raw product' : 'item';
        const err = new Error(
          `Insufficient stock: ${label} "${stockItem.item_name}" is required to fulfill this order. Required: ${req.required.toFixed(2)} ${uomCode}, Available: ${availableQty.toFixed(2)} ${uomCode}.`
        );
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }
    }
  }

  async submitKioskOrder({
    tenantSlug,
    outletSlug,
    customerName,
    customerPhone,
    customerEmail = '',
    customerAddress = '',
    orderType = 'TAKEAWAY',
    items,
    paymentDetails = {}
  }) {
    const { tenant, company, location } = await this.resolveOutletBySlugs(tenantSlug, outletSlug);
    const config = await this.getEffectiveRestaurantConfig(tenant._id, company._id, location._id);

    // Validate Customer Intake against policy
    const policy = config.customer_info_policy || {};
    if (policy.name === 'REQUIRED' && (!customerName || customerName.trim() === '')) {
      throw new Error('Customer Name is required for ordering at this outlet.');
    }
    if (policy.phone === 'REQUIRED' && (!customerPhone || customerPhone.trim() === '')) {
      throw new Error('Customer Phone Number is required for ordering at this outlet.');
    }
    if (policy.email === 'REQUIRED' && (!customerEmail || customerEmail.trim() === '')) {
      throw new Error('Customer Email is required for ordering at this outlet.');
    }
    if (policy.address === 'REQUIRED' && (!customerAddress || customerAddress.trim() === '')) {
      throw new Error('Customer Address is required for ordering at this outlet.');
    }

    // Pre-validate that sufficient raw materials and items exist to fulfill this order
    await this.validateOrderStockAvailability({ companyId: company._id, items, locationId: location._id });

    // Process & calculate items server-side authoritatively
    const orderCount = await RestaurantOrder.countDocuments({ company_id: company._id });
    const seq = String(orderCount + 1).padStart(3, '0');
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${seq}`;
    const pickupToken = `P-${seq}`;

    let subtotal = 0;
    let taxTotal = 0;
    const formattedItems = [];

    // Tax rate lookup (outlet default or fallback 5%)
    let taxRatePercent = 5;
    if (location.default_tax_rate_id) {
      const tr = await TaxRateConfig.findById(location.default_tax_rate_id);
      if (tr && tr.rate_percent) {
        taxRatePercent = parseFloat(tr.rate_percent.toString());
      }
    }

    for (const it of items) {
      const stockItem = await StockItem.findOne({ _id: it.item_id, company_id: company._id });
      if (!stockItem) throw new Error(`Menu item not found: ${it.item_id}`);

      let unitPrice = Number(stockItem.standard_selling_price || 0);

      // Check variant price adjustment
      let variantName = (it.variant_name || 'STANDARD').toUpperCase();
      if (variantName !== 'STANDARD') {
        const variant = await ProductVariant.findOne({
          company_id: company._id,
          base_item_id: stockItem._id,
          variant_name: variantName,
          is_active: true
        });
        if (variant && variant.price_adjustment) {
          unitPrice += Number(variant.price_adjustment);
        }
      }

      // Check modifiers add-ons price adjustment
      const selectedModifiers = [];
      if (Array.isArray(it.selected_modifiers)) {
        for (const mod of it.selected_modifiers) {
          const addOnPrice = Number(mod.price_adjustment || 0);
          unitPrice += addOnPrice;
          selectedModifiers.push({
            modifier_group_id: mod.modifier_group_id || null,
            option_id: mod.option_id || null,
            name: mod.name,
            price_adjustment: addOnPrice,
            quantity: Number(mod.quantity || 1),
            ingredient_item_id: mod.ingredient_item_id || null,
            quantity_to_consume: Number(mod.quantity_to_consume || 0)
          });
        }
      }

      const qty = Math.max(1, Number(it.quantity || 1));
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      const taxAmt = Number((lineTotal * (taxRatePercent / 100)).toFixed(2));

      subtotal += lineTotal;
      taxTotal += taxAmt;

      // Determine kitchen station routing
      let station = 'OVEN';
      const itemNameLower = stockItem.item_name.toLowerCase();
      if (itemNameLower.includes('shake') || itemNameLower.includes('coke') || itemNameLower.includes('beverage') || itemNameLower.includes('juice') || itemNameLower.includes('water')) {
        station = 'BEVERAGE';
      } else if (itemNameLower.includes('burger') || itemNameLower.includes('fries') || itemNameLower.includes('wings') || itemNameLower.includes('pasta')) {
        station = 'HOT_KITCHEN';
      }

      formattedItems.push({
        item_id: stockItem._id,
        item_name: stockItem.item_name,
        variant_name: variantName,
        modifiers: it.modifiers || [],
        excluded_ingredients: it.excluded_ingredients || [],
        quantity: qty,
        unit_price: unitPrice,
        tax_amount: taxAmt,
        line_total: lineTotal,
        kot_number: `KOT-${orderNumber.slice(-4)}`,
        kot_status: config.order_dispatch_policy?.auto_send_kds ? 'SENT_TO_KITCHEN' : 'PENDING',
        kitchen_station: station,
        selected_modifiers: selectedModifiers
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    const grandTotal = Number((subtotal + taxTotal).toFixed(2));

    const order = await RestaurantOrder.create({
      tenant_id: tenant._id,
      company_id: company._id,
      location_id: location._id,
      order_number: orderNumber,
      order_type: orderType,
      order_channel: 'KIOSK',
      customer_name: customerName || 'Kiosk Guest',
      customer_phone: customerPhone || '',
      customer_email: customerEmail || '',
      customer_address: customerAddress || '',
      pickup_token: pickupToken,
      status: config.order_dispatch_policy?.auto_send_kds ? 'KITCHEN_IN_PROGRESS' : 'CONFIRMED',
      items: formattedItems,
      subtotal,
      tax_total: taxTotal,
      discount_total: 0,
      grand_total: grandTotal,
      payment_details: {
        method: paymentDetails.method || 'UPI_DYNAMIC_QR',
        status: paymentDetails.status || 'PENDING',
        provider_reference: paymentDetails.provider_reference || '',
        idempotency_key: paymentDetails.idempotency_key || `PAY-${orderNumber}`,
        paid_at: paymentDetails.status === 'COMPLETED' ? new Date() : null,
        amount_paid: paymentDetails.status === 'COMPLETED' ? grandTotal : 0,
        tendered_amount: Number(paymentDetails.tendered_amount || grandTotal),
        change_amount: Number(paymentDetails.change_amount || 0)
      }
    });

    // Generate dynamic UPI QR string for instant payment
    const upiId = company.settings?.upi_id || 'veridexmerchant@okaxis';
    const upiPayString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(company.name)}&am=${grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${orderNumber}`)}`;

    return {
      order,
      pickup_token: pickupToken,
      upi_payment_string: upiPayString,
      grand_total: grandTotal
    };
  }

  // ==========================================
  // 7. ORDER CREATION (ADMIN / POS / TABLE)
  // ==========================================

  async createOrder({
    tenantId,
    companyId,
    userId,
    locationId = null,
    orderChannel = 'POS',
    tableId = null,
    orderType = 'DINE_IN',
    customerName = 'Guest',
    customerPhone = '',
    customerEmail = '',
    customerAddress = '',
    items
  }) {
    const config = await this.getEffectiveRestaurantConfig(tenantId, companyId, locationId);

    // Validate customer policy
    const policy = config.customer_info_policy || {};
    if (policy.name === 'REQUIRED' && (!customerName || customerName.trim() === '' || customerName === 'Guest')) {
      if (!policy.allow_anonymous_walkin) {
        throw new Error('Customer Name is required.');
      }
    }
    if (policy.phone === 'REQUIRED' && (!customerPhone || customerPhone.trim() === '')) {
      if (!policy.allow_anonymous_walkin) {
        throw new Error('Customer Phone is required.');
      }
    }

    // Pre-validate that sufficient raw materials and items exist to fulfill this order
    await this.validateOrderStockAvailability({ companyId, items, locationId });

    const orderCount = await RestaurantOrder.countDocuments({ company_id: companyId });
    const seq = String(orderCount + 1).padStart(3, '0');
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${seq}`;
    const pickupToken = `P-${seq}`;

    let subtotal = 0;
    let taxTotal = 0;
    const formattedItems = [];

    for (const it of items) {
      let itemId = it.item_id || it.stock_item_id;
      let stockItem = null;
      if (itemId) {
        stockItem = await StockItem.findOne({ _id: itemId, company_id: companyId });
      }
      if (!stockItem) {
        stockItem = await StockItem.findOne({ company_id: companyId });
        if (stockItem) itemId = stockItem._id;
      }

      let price = Number(it.unit_price || stockItem?.standard_selling_price || 0);

      // Add modifier adjustments if provided
      const selectedModifiers = [];
      if (Array.isArray(it.selected_modifiers)) {
        for (const mod of it.selected_modifiers) {
          const adj = Number(mod.price_adjustment || 0);
          price += adj;
          selectedModifiers.push({
            modifier_group_id: mod.modifier_group_id || null,
            option_id: mod.option_id || null,
            name: mod.name,
            price_adjustment: adj,
            quantity: Number(mod.quantity || 1),
            ingredient_item_id: mod.ingredient_item_id || null,
            quantity_to_consume: Number(mod.quantity_to_consume || 0)
          });
        }
      }

      const qty = Math.max(1, Number(it.quantity || 1));
      const lineTotal = Number((qty * price).toFixed(2));
      const taxAmt = Number((lineTotal * 0.05).toFixed(2)); // Standard 5% GST

      subtotal += lineTotal;
      taxTotal += taxAmt;

      let station = it.kitchen_station || 'OVEN';
      const nameLower = (it.item_name || stockItem?.item_name || '').toLowerCase();
      if (nameLower.includes('shake') || nameLower.includes('beverage') || nameLower.includes('drink') || nameLower.includes('coke')) {
        station = 'BEVERAGE';
      } else if (nameLower.includes('fry') || nameLower.includes('burger') || nameLower.includes('finger')) {
        station = 'HOT_KITCHEN';
      }

      formattedItems.push({
        item_id: itemId,
        item_name: it.item_name || stockItem?.item_name || 'Dish',
        variant_name: (it.variant_name || 'STANDARD').toUpperCase(),
        modifiers: it.modifiers || [],
        excluded_ingredients: it.excluded_ingredients || [],
        quantity: qty,
        unit_price: price,
        tax_amount: taxAmt,
        line_total: lineTotal,
        kot_number: `KOT-${orderNumber.slice(-4)}`,
        kot_status: 'PENDING',
        kitchen_station: station,
        selected_modifiers: selectedModifiers
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));

    const order = await RestaurantOrder.create({
      tenant_id: tenantId,
      company_id: companyId,
      location_id: locationId || null,
      order_number: orderNumber,
      order_type: orderType,
      order_channel: orderChannel,
      table_id: tableId || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      customer_address: customerAddress,
      pickup_token: pickupToken,
      status: 'CONFIRMED',
      items: formattedItems,
      subtotal,
      tax_total: taxTotal,
      discount_total: 0,
      grand_total: Number((subtotal + taxTotal).toFixed(2)),
      created_by: userId
    });

    if (tableId) {
      await RestaurantTable.findByIdAndUpdate(tableId, {
        $set: { status: 'OCCUPIED', current_order_id: order._id }
      });
    }

    return order;
  }

  // ==========================================
  // 8. KITCHEN DISPLAY SYSTEM (KDS) MULTI-STATION
  // ==========================================

  async getKdsOrders(companyId, { station = null, locationId = null } = {}) {
    const filter = {
      company_id: companyId,
      status: { $in: ['CONFIRMED', 'KITCHEN_IN_PROGRESS', 'READY'] }
    };
    if (locationId) filter.location_id = locationId;

    const orders = await RestaurantOrder.find(filter)
      .populate('table_id location_id')
      .sort({ created_at: 1 });

    if (!station || station === 'ALL') {
      return orders;
    }

    // Filter items to station
    const filteredOrders = [];
    for (const ord of orders) {
      const stationItems = ord.items.filter(it => it.kitchen_station === station.toUpperCase());
      if (stationItems.length > 0) {
        const ordObj = ord.toObject();
        ordObj.items = stationItems;
        filteredOrders.push(ordObj);
      }
    }
    return filteredOrders;
  }

  async updateKdsItemStatus({ companyId, orderId, itemId, stationStatus }) {
    const order = await RestaurantOrder.findOne({ _id: orderId, company_id: companyId });
    if (!order) throw new Error('Order not found');

    const item = order.items.id(itemId);
    if (!item) throw new Error('Order item not found');

    item.kot_status = stationStatus;

    // If any item is preparing, set order status to KITCHEN_IN_PROGRESS
    const allReady = order.items.every(it => it.kot_status === 'READY' || it.kot_status === 'SERVED');
    if (allReady) {
      order.status = 'READY';
    } else {
      order.status = 'KITCHEN_IN_PROGRESS';
    }

    await order.save();
    return order;
  }

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

  // ==========================================
  // 9. SETTLEMENT, COMMERCIAL BILLING & STOCK
  // ==========================================

  async settleAndBillOrder({ orderId, userId, godownId = null, paymentDetails = {} }) {
    const order = await RestaurantOrder.findById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'COMPLETED') throw new Error('Order is already settled and billed.');

    // Find godown: location default godown, provided godown, or first active godown
    let defaultGodown = null;
    if (godownId) {
      defaultGodown = await Godown.findById(godownId);
    } else if (order.location_id) {
      const loc = await StoreLocation.findById(order.location_id);
      if (loc && loc.default_godown_id) {
        defaultGodown = await Godown.findById(loc.default_godown_id);
      }
    }
    if (!defaultGodown) {
      defaultGodown = await Godown.findOne({ company_id: order.company_id, is_active: true });
    }
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
        table_id: order.table_id,
        location_id: order.location_id
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

    // 2. Consume Raw Ingredients based on Recipe BOM & Modifiers
    const consumedIngredients = [];
    for (const item of order.items) {
      // 2a. Base Recipe Consumption (skipping exclusions)
      let bom = await RecipeBOM.findOne({
        company_id: order.company_id,
        menu_item_id: item.item_id,
        variant_name: item.variant_name || 'STANDARD',
        is_active: true
      });
      if (!bom && item.variant_name && item.variant_name !== 'STANDARD') {
        bom = await RecipeBOM.findOne({
          company_id: order.company_id,
          menu_item_id: item.item_id,
          variant_name: 'STANDARD',
          is_active: true
        }) || await RecipeBOM.findOne({
          company_id: order.company_id,
          menu_item_id: item.item_id,
          is_active: true
        });
      }

      if (bom && bom.ingredients && bom.ingredients.length > 0) {
        const excludedSet = new Set((item.excluded_ingredients || []).map(id => String(id)));
        for (const ing of bom.ingredients) {
          // If customer customized order to exclude this ingredient (e.g. NO CHEESE or NO SAUCE), skip stock deduction!
          if (excludedSet.has(String(ing.ingredient_item_id))) {
            continue;
          }

          const wasteFactor = 1 + (ing.waste_percentage || 0) / 100;
          const totalConsumeQty = (Number(ing.quantity) / (bom.yield_quantity || 1)) * Number(item.quantity) * wasteFactor;

          let uomId = ing.uom_id;
          if (!uomId) {
            const ingStock = await StockItem.findById(ing.ingredient_item_id);
            uomId = ingStock ? (ingStock.base_uom_id || ingStock.uom_id) : null;
          }

          const movementResult = await recordStockMovement({
            tenantId: order.tenant_id,
            companyId: order.company_id,
            stockItemId: ing.ingredient_item_id,
            godownId: defaultGodown._id,
            movementType: 'RECIPE_CONSUMPTION',
            direction: 'OUT',
            quantity: totalConsumeQty,
            uomId,
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

      // 2b. Add-on Modifiers Consumption (e.g. EXTRA CHEESE)
      if (item.selected_modifiers && item.selected_modifiers.length > 0) {
        for (const mod of item.selected_modifiers) {
          if (mod.ingredient_item_id && Number(mod.quantity_to_consume) > 0) {
            const addOnConsumeQty = Number(mod.quantity_to_consume) * Number(mod.quantity || 1) * Number(item.quantity);
            let modUomId = mod.uom_id;
            if (!modUomId) {
              const modStock = await StockItem.findById(mod.ingredient_item_id);
              modUomId = modStock ? (modStock.base_uom_id || modStock.uom_id) : null;
            }

            const movementResult = await recordStockMovement({
              tenantId: order.tenant_id,
              companyId: order.company_id,
              stockItemId: mod.ingredient_item_id,
              godownId: defaultGodown._id,
              movementType: 'RECIPE_CONSUMPTION',
              direction: 'OUT',
              quantity: addOnConsumeQty,
              uomId: modUomId,
              idempotencyKey: `REST-MOD-CONSUME-${order.order_number}-${mod.option_id || mod.name}-${mod.ingredient_item_id}`,
              sourceDocumentType: 'RESTAURANT_ORDER',
              sourceDocumentId: order.order_number,
              notes: `Add-on consumed for order ${order.order_number} (${mod.name})`,
              userId
            });

            consumedIngredients.push({
              ingredient_item_id: mod.ingredient_item_id,
              quantity: addOnConsumeQty,
              balance: movementResult.balance
            });
          }
        }
      }
    }

    // 3. Mark Table Vacant and Order Completed
    if (order.table_id) {
      await RestaurantTable.findByIdAndUpdate(order.table_id, {
        $set: { status: 'VACANT', current_order_id: null }
      });
    }

    // Update payment details if provided
    if (paymentDetails.method || paymentDetails.status) {
      order.payment_details.method = paymentDetails.method || order.payment_details.method || 'CASH';
      order.payment_details.status = paymentDetails.status || 'COMPLETED';
      order.payment_details.provider_reference = paymentDetails.provider_reference || order.payment_details.provider_reference || '';
      order.payment_details.paid_at = new Date();
      order.payment_details.amount_paid = order.grand_total;
      order.payment_details.tendered_amount = Number(paymentDetails.tendered_amount || order.grand_total);
      order.payment_details.change_amount = Number(paymentDetails.change_amount || 0);
    } else {
      order.payment_details.status = 'COMPLETED';
      order.payment_details.paid_at = new Date();
      order.payment_details.amount_paid = order.grand_total;
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

  // ==========================================
  // 10. ORDER CANCELLATION & REVERSAL
  // ==========================================

  async cancelOrder({ orderId, userId, reason = 'Order cancelled', autoReverse = true }) {
    const order = await RestaurantOrder.findById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'CANCELLED') throw new Error('Order is already cancelled.');

    let reversalResult = null;

    // 1. If order was billed/invoiced, reverse the commercial document
    if (order.commercial_document_id && autoReverse) {
      try {
        reversalResult = await reverseCommercialDocument({
          tenantId: order.tenant_id,
          companyId: order.company_id,
          documentId: order.commercial_document_id,
          userId,
          reason: `Reversal for cancelled restaurant order ${order.order_number}: ${reason}`
        });
      } catch (revErr) {
        console.warn('Commercial document reversal error:', revErr.message);
      }
    }

    // 2. If raw ingredients were consumed, reverse any recipe stock movements
    if (order.ingredients_consumed) {
      const movements = await StockMovement.find({
        tenant_id: order.tenant_id,
        company_id: order.company_id,
        $or: [
          { source_document_id: order.order_number },
          { sourceDocumentId: order.order_number }
        ],
        is_reversed: { $ne: true }
      });

      for (const mov of movements) {
        try {
          await reverseStockMovement({
            tenantId: order.tenant_id,
            companyId: order.company_id,
            movementId: mov._id,
            reason: `Cancelled restaurant order ${order.order_number}`,
            userId
          });
        } catch (mErr) {
          console.warn(`Stock movement reversal failed for ${mov._id}:`, mErr.message);
        }
      }
      order.ingredients_consumed = false;
    }

    // 3. Reset Table to VACANT if attached
    if (order.table_id) {
      await RestaurantTable.findByIdAndUpdate(order.table_id, {
        $set: { status: 'VACANT', current_order_id: null }
      });
    }

    // 4. Update order status
    order.status = 'CANCELLED';
    if (order.payment_details) {
      if (order.payment_details.status === 'COMPLETED' || autoReverse) {
        order.payment_details.status = 'REFUNDED';
      } else {
        order.payment_details.status = 'CANCELLED';
      }
    }
    await order.save();

    return {
      order,
      reversed_commercial_doc: reversalResult ? reversalResult.document : null,
      message: 'Order cancelled successfully and associated vouchers/stock reversed.'
    };
  }

  async deleteOrder({ orderId, userId, reason = 'Order deleted' }) {
    const order = await RestaurantOrder.findById(orderId);
    if (!order) throw new Error('Order not found');

    if (order.status !== 'CANCELLED') {
      await this.cancelOrder({ orderId, userId, reason, autoReverse: true });
    }

    await RestaurantOrder.findByIdAndDelete(orderId);

    return {
      success: true,
      deletedOrderId: orderId,
      message: 'Order deleted successfully from database.'
    };
  }
}

module.exports = new RestaurantService();
