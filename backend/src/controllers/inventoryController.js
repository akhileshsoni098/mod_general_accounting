const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  StockGroup,
  StockCategory,
  UnitOfMeasurement,
  Godown,
  StockItem,
  StockMovement,
  StockBalance
} = require('../models');
const { convertQuantity, getStandardUnits } = require('../services/uomConversionService');
const { appendStockMovement, reverseStockMovement, rebuildStockBalances } = require('../services/stockMovementService');
const { recordOpeningStock } = require('../services/openingStockService');

// ==========================================
// 1. STOCK GROUPS
// ==========================================

async function getStockGroups(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { status, parent_group_id } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status;
    if (parent_group_id !== undefined) {
      filter.parent_group_id = parent_group_id === 'null' || parent_group_id === '' ? null : parent_group_id;
    }

    const groups = await StockGroup.find(filter)
      .populate('parent_group_id', 'group_name group_code')
      .sort({ group_name: 1 });

    return res.success(groups);
  } catch (err) {
    return res.error('Failed to fetch stock groups', 500, err.message);
  }
}

async function getStockGroupById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const group = await StockGroup.findOne({ _id: id, tenant_id: tenantId, company_id: companyId })
      .populate('parent_group_id', 'group_name group_code');

    if (!group) {
      return res.error(`Stock group not found: ${id}`, 404);
    }

    return res.success(group);
  } catch (err) {
    return res.error('Failed to fetch stock group', 500, err.message);
  }
}

async function createStockGroup(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { group_code, group_name, parent_group_id, description } = req.body;

    if (!group_code || !group_name) {
      return res.error('group_code and group_name are required', 400);
    }

    const cleanCode = group_code.trim().toUpperCase();

    // Check duplicate code within company
    const existing = await StockGroup.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      group_code: cleanCode
    });
    if (existing) {
      return res.error(`Stock group code "${cleanCode}" already exists in this company`, 409, {
        code: 'DUPLICATE_GROUP_CODE'
      });
    }

    // Validate parent if provided
    let parentId = null;
    if (parent_group_id) {
      const parent = await StockGroup.findOne({
        _id: parent_group_id,
        tenant_id: tenantId,
        company_id: companyId
      });
      if (!parent) {
        return res.error(`Parent stock group not found: ${parent_group_id}`, 404);
      }
      parentId = parent._id;
    }

    const group = await StockGroup.create({
      tenant_id: tenantId,
      company_id: companyId,
      group_code: cleanCode,
      group_name: group_name.trim(),
      parent_group_id: parentId,
      description: description || '',
      status: 'ACTIVE'
    });

    return res.success(group, 201);
  } catch (err) {
    return res.error('Failed to create stock group', 500, err.message);
  }
}

async function updateStockGroup(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const { group_name, parent_group_id, description, status } = req.body;

    const group = await StockGroup.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!group) {
      return res.error(`Stock group not found: ${id}`, 404);
    }

    // Cycle prevention for parent_group_id
    if (parent_group_id !== undefined) {
      if (parent_group_id && parent_group_id.toString() === id.toString()) {
        return res.error('A stock group cannot be its own parent', 400, {
          code: 'SELF_PARENT_CYCLE'
        });
      }

      if (parent_group_id) {
        // Verify parent exists in company
        const parent = await StockGroup.findOne({
          _id: parent_group_id,
          tenant_id: tenantId,
          company_id: companyId
        });
        if (!parent) {
          return res.error(`Parent stock group not found: ${parent_group_id}`, 404);
        }

        // Cycle check: climb ancestry from parent_group_id up to root
        let curr = parent;
        while (curr && curr.parent_group_id) {
          if (curr.parent_group_id.toString() === id.toString()) {
            return res.error('Circular dependency detected in stock group hierarchy', 400, {
              code: 'CIRCULAR_GROUP_DEPENDENCY'
            });
          }
          curr = await StockGroup.findOne({
            _id: curr.parent_group_id,
            tenant_id: tenantId,
            company_id: companyId
          });
        }
        group.parent_group_id = parent._id;
      } else {
        group.parent_group_id = null;
      }
    }

    if (group_name) group.group_name = group_name.trim();
    if (description !== undefined) group.description = description;
    if (status) group.status = status;

    await group.save();
    return res.success(group);
  } catch (err) {
    return res.error('Failed to update stock group', 500, err.message);
  }
}

async function deleteStockGroup(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const group = await StockGroup.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!group) {
      return res.error(`Stock group not found: ${id}`, 404);
    }

    // Check if any active subgroups reference this group
    const activeSubgroups = await StockGroup.exists({
      tenant_id: tenantId,
      company_id: companyId,
      parent_group_id: id,
      status: 'ACTIVE'
    });
    if (activeSubgroups) {
      return res.error('Cannot delete stock group with active subgroups', 400, {
        code: 'GROUP_HAS_ACTIVE_SUBGROUPS'
      });
    }

    // Check if any stock items reference this group
    const activeItems = await StockItem.exists({
      tenant_id: tenantId,
      company_id: companyId,
      stock_group_id: id,
      status: 'ACTIVE'
    });
    if (activeItems) {
      return res.error('Cannot delete stock group referenced by active stock items', 400, {
        code: 'GROUP_HAS_ACTIVE_ITEMS'
      });
    }

    group.status = 'INACTIVE';
    await group.save();

    return res.success({ message: `Stock group "${group.group_name}" deactivated`, id: group._id });
  } catch (err) {
    return res.error('Failed to delete stock group', 500, err.message);
  }
}

// ==========================================
// 2. STOCK CATEGORIES
// ==========================================

async function getStockCategories(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { status } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status;

    const categories = await StockCategory.find(filter).sort({ category_name: 1 });
    return res.success(categories);
  } catch (err) {
    return res.error('Failed to fetch stock categories', 500, err.message);
  }
}

async function getStockCategoryById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const category = await StockCategory.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!category) {
      return res.error(`Stock category not found: ${id}`, 404);
    }

    return res.success(category);
  } catch (err) {
    return res.error('Failed to fetch stock category', 500, err.message);
  }
}

async function createStockCategory(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { category_code, category_name, description } = req.body;

    if (!category_code || !category_name) {
      return res.error('category_code and category_name are required', 400);
    }

    const cleanCode = category_code.trim().toUpperCase();

    const existing = await StockCategory.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      category_code: cleanCode
    });
    if (existing) {
      return res.error(`Stock category code "${cleanCode}" already exists in this company`, 409, {
        code: 'DUPLICATE_CATEGORY_CODE'
      });
    }

    const category = await StockCategory.create({
      tenant_id: tenantId,
      company_id: companyId,
      category_code: cleanCode,
      category_name: category_name.trim(),
      description: description || '',
      status: 'ACTIVE'
    });

    return res.success(category, 201);
  } catch (err) {
    return res.error('Failed to create stock category', 500, err.message);
  }
}

async function updateStockCategory(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const { category_name, description, status } = req.body;

    const category = await StockCategory.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!category) {
      return res.error(`Stock category not found: ${id}`, 404);
    }

    if (category_name) category.category_name = category_name.trim();
    if (description !== undefined) category.description = description;
    if (status) category.status = status;

    await category.save();
    return res.success(category);
  } catch (err) {
    return res.error('Failed to update stock category', 500, err.message);
  }
}

async function deleteStockCategory(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const category = await StockCategory.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!category) {
      return res.error(`Stock category not found: ${id}`, 404);
    }

    const activeItems = await StockItem.exists({
      tenant_id: tenantId,
      company_id: companyId,
      stock_category_id: id,
      status: 'ACTIVE'
    });
    if (activeItems) {
      return res.error('Cannot delete stock category referenced by active stock items', 400, {
        code: 'CATEGORY_HAS_ACTIVE_ITEMS'
      });
    }

    category.status = 'INACTIVE';
    await category.save();
    return res.success({ message: `Stock category "${category.category_name}" deactivated`, id: category._id });
  } catch (err) {
    return res.error('Failed to delete stock category', 500, err.message);
  }
}

// ==========================================
// 3. UNITS OF MEASUREMENT (UOM)
// ==========================================

async function getUnitsOfMeasurement(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { unit_type, status } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (unit_type) filter.unit_type = unit_type.toUpperCase();
    if (status) filter.status = status;

    const uoms = await UnitOfMeasurement.find(filter).sort({ unit_code: 1 });
    return res.success(uoms);
  } catch (err) {
    return res.error('Failed to fetch units of measurement', 500, err.message);
  }
}

async function getUnitOfMeasurementById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const uom = await UnitOfMeasurement.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!uom) {
      return res.error(`Unit of measurement not found: ${id}`, 404);
    }

    return res.success(uom);
  } catch (err) {
    return res.error('Failed to fetch unit of measurement', 500, err.message);
  }
}

async function createUnitOfMeasurement(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { unit_code, unit_name, symbol, unit_type, decimal_places, description } = req.body;

    if (!unit_code || !unit_name || !unit_type) {
      return res.error('unit_code, unit_name, and unit_type are required', 400);
    }

    const cleanCode = unit_code.trim().toUpperCase();
    const cleanType = unit_type.trim().toUpperCase();

    const validTypes = ['COUNT', 'MASS', 'VOLUME', 'LENGTH', 'PACKAGING', 'CUSTOM'];
    if (!validTypes.includes(cleanType)) {
      return res.error(`Invalid unit_type. Allowed: ${validTypes.join(', ')}`, 400);
    }

    const existing = await UnitOfMeasurement.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      unit_code: cleanCode
    });
    if (existing) {
      return res.error(`Unit of measurement code "${cleanCode}" already exists in this company`, 409, {
        code: 'DUPLICATE_UNIT_CODE'
      });
    }

    const uom = await UnitOfMeasurement.create({
      tenant_id: tenantId,
      company_id: companyId,
      unit_code: cleanCode,
      unit_name: unit_name.trim(),
      symbol: symbol ? symbol.trim() : cleanCode.toLowerCase(),
      unit_type: cleanType,
      decimal_places: decimal_places !== undefined ? Number(decimal_places) : (cleanType === 'COUNT' ? 0 : 3),
      is_system_standard: false,
      description: description || '',
      status: 'ACTIVE'
    });

    return res.success(uom, 201);
  } catch (err) {
    return res.error('Failed to create unit of measurement', 500, err.message);
  }
}

async function updateUnitOfMeasurement(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const { unit_name, symbol, decimal_places, description, status } = req.body;

    const uom = await UnitOfMeasurement.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!uom) {
      return res.error(`Unit of measurement not found: ${id}`, 404);
    }

    if (unit_name) uom.unit_name = unit_name.trim();
    if (symbol) uom.symbol = symbol.trim();
    if (decimal_places !== undefined) uom.decimal_places = Number(decimal_places);
    if (description !== undefined) uom.description = description;
    if (status) uom.status = status;

    await uom.save();
    return res.success(uom);
  } catch (err) {
    return res.error('Failed to update unit of measurement', 500, err.message);
  }
}

async function simulateUomConversion(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { stock_item_id, from_uom_id, to_uom_id, quantity } = req.body;

    if (!from_uom_id || !to_uom_id || quantity === undefined) {
      return res.error('from_uom_id, to_uom_id, and quantity are required', 400);
    }

    const result = await convertQuantity({
      tenantId,
      companyId,
      stockItemId: stock_item_id || null,
      fromUomId: from_uom_id,
      toUomId: to_uom_id,
      quantity
    });

    return res.success(result);
  } catch (err) {
    return res.error('Conversion failed', 400, err.message);
  }
}

// ==========================================
// 4. GODOWNS / WAREHOUSES
// ==========================================

async function getGodowns(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { status } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status;

    const godowns = await Godown.find(filter).sort({ is_default: -1, godown_name: 1 });
    return res.success(godowns);
  } catch (err) {
    return res.error('Failed to fetch godowns', 500, err.message);
  }
}

async function getGodownById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const godown = await Godown.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!godown) {
      return res.error(`Godown not found: ${id}`, 404);
    }

    return res.success(godown);
  } catch (err) {
    return res.error('Failed to fetch godown', 500, err.message);
  }
}

async function createGodown(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { godown_code, godown_name, address, is_default, contact_person, phone } = req.body;

    if (!godown_code || !godown_name) {
      return res.error('godown_code and godown_name are required', 400);
    }

    const cleanCode = godown_code.trim().toUpperCase();

    const existing = await Godown.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      godown_code: cleanCode
    });
    if (existing) {
      return res.error(`Godown code "${cleanCode}" already exists in this company`, 409, {
        code: 'DUPLICATE_GODOWN_CODE'
      });
    }

    if (is_default) {
      // Unset existing default for this company
      await Godown.updateMany(
        { tenant_id: tenantId, company_id: companyId, is_default: true },
        { is_default: false }
      );
    }

    const godown = await Godown.create({
      tenant_id: tenantId,
      company_id: companyId,
      godown_code: cleanCode,
      godown_name: godown_name.trim(),
      address: address || {},
      is_default: Boolean(is_default),
      contact_person: contact_person || '',
      phone: phone || '',
      status: 'ACTIVE'
    });

    return res.success(godown, 201);
  } catch (err) {
    return res.error('Failed to create godown', 500, err.message);
  }
}

async function updateGodown(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const { godown_name, address, is_default, contact_person, phone, status } = req.body;

    const godown = await Godown.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!godown) {
      return res.error(`Godown not found: ${id}`, 404);
    }

    if (is_default) {
      await Godown.updateMany(
        { tenant_id: tenantId, company_id: companyId, _id: { $ne: id }, is_default: true },
        { is_default: false }
      );
      godown.is_default = true;
    } else if (is_default === false && godown.is_default) {
      // If unsetting default, make sure there is at least one default or allow if user intended
      godown.is_default = false;
    }

    if (godown_name) godown.godown_name = godown_name.trim();
    if (address !== undefined) godown.address = address;
    if (contact_person !== undefined) godown.contact_person = contact_person;
    if (phone !== undefined) godown.phone = phone;
    if (status) godown.status = status;

    await godown.save();
    return res.success(godown);
  } catch (err) {
    return res.error('Failed to update godown', 500, err.message);
  }
}

// ==========================================
// 5. STOCK ITEMS
// ==========================================

async function getStockItems(req, res) {
  try {
    const { tenantId, companyId } = req;
    const {
      page = 1,
      limit = 50,
      search,
      stock_group_id,
      stock_category_id,
      status,
      costing_method
    } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status;
    if (stock_group_id) filter.stock_group_id = stock_group_id;
    if (stock_category_id) filter.stock_category_id = stock_category_id;
    if (costing_method) filter.costing_method = costing_method.toUpperCase();

    if (search) {
      filter.$or = [
        { item_code: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { item_name: { $regex: search, $options: 'i' } },
        { barcodes: { $in: [search.trim()] } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      StockItem.find(filter)
        .populate('stock_group_id', 'group_name group_code')
        .populate('stock_category_id', 'category_name category_code')
        .populate('base_uom_id', 'unit_code unit_name symbol decimal_places')
        .populate('purchase_uom_id', 'unit_code unit_name symbol')
        .populate('sales_uom_id', 'unit_code unit_name symbol')
        .populate('uom_conversions.alternate_uom_id', 'unit_code unit_name symbol')
        .sort({ item_name: 1 })
        .skip(skip)
        .limit(Number(limit)),
      StockItem.countDocuments(filter)
    ]);

    return res.success({
      items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    return res.error('Failed to fetch stock items', 500, err.message);
  }
}

async function getStockItemById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const item = await StockItem.findOne({ _id: id, tenant_id: tenantId, company_id: companyId })
      .populate('stock_group_id', 'group_name group_code')
      .populate('stock_category_id', 'category_name category_code')
      .populate('base_uom_id', 'unit_code unit_name symbol decimal_places')
      .populate('purchase_uom_id', 'unit_code unit_name symbol')
      .populate('sales_uom_id', 'unit_code unit_name symbol')
      .populate('uom_conversions.alternate_uom_id', 'unit_code unit_name symbol decimal_places');

    if (!item) {
      return res.error(`Stock item not found: ${id}`, 404);
    }

    // Attach current stock balances across godowns
    const balances = await StockBalance.find({
      tenant_id: tenantId,
      company_id: companyId,
      stock_item_id: id
    }).populate('godown_id', 'godown_code godown_name is_default');

    return res.success({
      item,
      balances
    });
  } catch (err) {
    return res.error('Failed to fetch stock item', 500, err.message);
  }
}

async function createStockItem(req, res) {
  try {
    const { tenantId, companyId } = req;
    const {
      item_code,
      sku,
      item_name,
      barcodes,
      stock_group_id,
      stock_category_id,
      base_uom_id,
      purchase_uom_id,
      sales_uom_id,
      uom_conversions,
      costing_method,
      purchase_price,
      sales_price,
      mrp,
      reorder_level,
      reorder_quantity,
      is_batch_tracked,
      is_expiry_tracked,
      hsn_sac_code,
      tax_rate,
      description,
      is_stock_tracked
    } = req.body;

    if (!item_code || !sku || !item_name || !base_uom_id) {
      return res.error('item_code, sku, item_name, and base_uom_id are required', 400);
    }

    const cleanItemCode = item_code.trim().toUpperCase();
    const cleanSku = sku.trim().toUpperCase();

    // Check unique item_code within company
    const existingCode = await StockItem.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      item_code: cleanItemCode
    });
    if (existingCode) {
      return res.error(`Stock item code "${cleanItemCode}" already exists in this company`, 409, {
        code: 'DUPLICATE_ITEM_CODE'
      });
    }

    // Check unique sku within company
    const existingSku = await StockItem.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      sku: cleanSku
    });
    if (existingSku) {
      return res.error(`Stock SKU "${cleanSku}" already exists in this company`, 409, {
        code: 'DUPLICATE_SKU'
      });
    }

    // Validate base_uom_id exists in company
    const baseUom = await UnitOfMeasurement.findOne({
      _id: base_uom_id,
      tenant_id: tenantId,
      company_id: companyId
    });
    if (!baseUom) {
      return res.error(`Base UOM not found in company: ${base_uom_id}`, 404);
    }

    // Validate stock_group_id if provided or default to PRIMARY
    let groupId = null;
    if (stock_group_id) {
      const group = await StockGroup.findOne({
        _id: stock_group_id,
        tenant_id: tenantId,
        company_id: companyId
      });
      if (!group) {
        return res.error(`Stock group not found in company: ${stock_group_id}`, 404);
      }
      groupId = group._id;
    } else {
      const primaryGroup = await StockGroup.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        group_code: 'PRIMARY'
      });
      if (primaryGroup) {
        groupId = primaryGroup._id;
      }
    }

    // Validate stock_category_id if provided
    let categoryId = null;
    if (stock_category_id) {
      const category = await StockCategory.findOne({
        _id: stock_category_id,
        tenant_id: tenantId,
        company_id: companyId
      });
      if (!category) {
        return res.error(`Stock category not found in company: ${stock_category_id}`, 404);
      }
      categoryId = category._id;
    }

    // Validate uom_conversions
    const validatedConversions = [];
    if (Array.isArray(uom_conversions)) {
      for (const conv of uom_conversions) {
        if (!conv.alternate_uom_id || !conv.conversion_factor) continue;
        const altUom = await UnitOfMeasurement.findOne({
          _id: conv.alternate_uom_id,
          tenant_id: tenantId,
          company_id: companyId
        });
        if (!altUom) {
          return res.error(`Alternate UOM not found: ${conv.alternate_uom_id}`, 404);
        }
        const factor = new BigNumber(conv.conversion_factor);
        if (factor.isNaN() || factor.isLessThanOrEqualTo(0)) {
          return res.error(`Conversion factor must be greater than 0`, 400);
        }
        validatedConversions.push({
          alternate_uom_id: altUom._id,
          conversion_factor: factor.toFixed(6)
        });
      }
    }

    const item = await StockItem.create({
      tenant_id: tenantId,
      company_id: companyId,
      item_code: cleanItemCode,
      sku: cleanSku,
      item_name: item_name.trim(),
      barcodes: Array.isArray(barcodes) ? barcodes.map(b => b.trim()).filter(Boolean) : [],
      stock_group_id: groupId,
      stock_category_id: categoryId,
      base_uom_id: baseUom._id,
      purchase_uom_id: purchase_uom_id || baseUom._id,
      sales_uom_id: sales_uom_id || baseUom._id,
      uom_conversions: validatedConversions,
      costing_method: costing_method ? costing_method.toUpperCase() : 'AVERAGE_COST',
      purchase_price: mongoose.Types.Decimal128.fromString(String(purchase_price !== undefined ? purchase_price : '0.00')),
      sales_price: mongoose.Types.Decimal128.fromString(String(sales_price !== undefined ? sales_price : '0.00')),
      reorder_level: Number(reorder_level || 0),
      reorder_quantity: Number(reorder_quantity || 0),
      is_batch_tracked: Boolean(is_batch_tracked),
      is_expiry_tracked: Boolean(is_expiry_tracked),
      hsn_sac_code: hsn_sac_code || '',
      tax_rate: tax_rate !== undefined ? Number(tax_rate) : 0,
      description: description || '',
      is_stock_tracked: is_stock_tracked !== undefined ? Boolean(is_stock_tracked) : true,
      status: 'ACTIVE'
    });

    return res.success(item, 201);
  } catch (err) {
    return res.error('Failed to create stock item', 500, err.message);
  }
}

async function updateStockItem(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const updates = req.body;

    const item = await StockItem.findOne({ _id: id, tenant_id: tenantId, company_id: companyId });
    if (!item) {
      return res.error(`Stock item not found: ${id}`, 404);
    }

    // Base UOM immutability check: cannot change base UOM if stock movements already exist!
    if (updates.base_uom_id && updates.base_uom_id.toString() !== item.base_uom_id.toString()) {
      const hasMovements = await StockMovement.exists({
        tenant_id: tenantId,
        company_id: companyId,
        stock_item_id: id
      });
      if (hasMovements) {
        return res.error('Cannot change base UOM for stock item with existing stock movements', 400, {
          code: 'BASE_UOM_IMMUTABLE_AFTER_MOVEMENTS'
        });
      }
      const baseUom = await UnitOfMeasurement.findOne({
        _id: updates.base_uom_id,
        tenant_id: tenantId,
        company_id: companyId
      });
      if (!baseUom) {
        return res.error(`Base UOM not found: ${updates.base_uom_id}`, 404);
      }
      item.base_uom_id = baseUom._id;
    }

    if (updates.item_name) item.item_name = updates.item_name.trim();
    if (updates.barcodes) item.barcodes = updates.barcodes;
    if (updates.stock_group_id !== undefined) item.stock_group_id = updates.stock_group_id || null;
    if (updates.stock_category_id !== undefined) item.stock_category_id = updates.stock_category_id || null;
    if (updates.purchase_uom_id) item.purchase_uom_id = updates.purchase_uom_id;
    if (updates.sales_uom_id) item.sales_uom_id = updates.sales_uom_id;
    if (updates.costing_method) item.costing_method = updates.costing_method.toUpperCase();
    if (updates.purchase_price !== undefined) item.purchase_price = String(updates.purchase_price);
    if (updates.sales_price !== undefined) item.sales_price = String(updates.sales_price);
    if (updates.mrp !== undefined) item.mrp = String(updates.mrp);
    if (updates.reorder_level !== undefined) item.reorder_level = String(updates.reorder_level);
    if (updates.reorder_quantity !== undefined) item.reorder_quantity = String(updates.reorder_quantity);
    if (updates.is_batch_tracked !== undefined) item.is_batch_tracked = Boolean(updates.is_batch_tracked);
    if (updates.is_expiry_tracked !== undefined) item.is_expiry_tracked = Boolean(updates.is_expiry_tracked);
    if (updates.hsn_sac_code !== undefined) item.hsn_sac_code = updates.hsn_sac_code;
    if (updates.tax_rate !== undefined) item.tax_rate = Number(updates.tax_rate);
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.status) item.status = updates.status;

    if (Array.isArray(updates.uom_conversions)) {
      const validatedConversions = [];
      for (const conv of updates.uom_conversions) {
        if (!conv.alternate_uom_id || !conv.conversion_factor) continue;
        const altUom = await UnitOfMeasurement.findOne({
          _id: conv.alternate_uom_id,
          tenant_id: tenantId,
          company_id: companyId
        });
        if (!altUom) continue;
        const factor = new BigNumber(conv.conversion_factor);
        if (factor.isNaN() || factor.isLessThanOrEqualTo(0)) continue;
        validatedConversions.push({
          alternate_uom_id: altUom._id,
          conversion_factor: factor.toFixed(6)
        });
      }
      item.uom_conversions = validatedConversions;
    }

    await item.save();
    return res.success(item);
  } catch (err) {
    return res.error('Failed to update stock item', 500, err.message);
  }
}

// ==========================================
// 6. OPENING STOCK
// ==========================================

async function postOpeningStock(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const {
      stock_item_id,
      godown_id,
      quantity,
      uom_id,
      unit_rate,
      total_cost,
      batch_number,
      expiry_date,
      notes
    } = req.body;

    if (!stock_item_id || !godown_id || quantity === undefined || unit_rate === undefined) {
      return res.error('stock_item_id, godown_id, quantity, and unit_rate are required', 400);
    }

    const result = await recordOpeningStock({
      tenantId,
      companyId,
      stockItemId: stock_item_id,
      godownId: godown_id,
      quantity,
      uomId: uom_id || null,
      unitRate: unit_rate,
      totalCost: total_cost || null,
      batchNumber: batch_number || null,
      expiryDate: expiry_date || null,
      notes: notes || '',
      userId: user?._id || null
    });

    return res.success({
      message: 'Opening stock posted successfully',
      movement: result.movement,
      balance: result.balance,
      gl_status: result.gl_status,
      gl_note: result.gl_note
    }, 201);
  } catch (err) {
    const statusCode = err.code === 'OPENING_STOCK_ALREADY_POSTED' ? 409 : 400;
    return res.error(err.message, statusCode, { code: err.code || 'OPENING_STOCK_ERROR' });
  }
}

// ==========================================
// 7. STOCK BALANCES & INVENTORY SUMMARY
// ==========================================

async function getStockBalances(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { stock_item_id, godown_id, non_zero_only } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (stock_item_id) filter.stock_item_id = stock_item_id;
    if (godown_id) filter.godown_id = godown_id;

    let balances = await StockBalance.find(filter)
      .populate({
        path: 'stock_item_id',
        select: 'item_code sku item_name stock_group_id stock_category_id base_uom_id status costing_method',
        populate: [
          { path: 'base_uom_id', select: 'unit_code symbol decimal_places' },
          { path: 'stock_group_id', select: 'group_name group_code' },
          { path: 'stock_category_id', select: 'category_name' }
        ]
      })
      .populate('godown_id', 'godown_code godown_name is_default')
      .sort({ 'stock_item_id.item_name': 1 });

    if (non_zero_only === 'true') {
      balances = balances.filter(b => {
        const qty = new BigNumber(b.quantity_on_hand.toString());
        return !qty.isZero();
      });
    }

    return res.success(balances);
  } catch (err) {
    return res.error('Failed to fetch stock balances', 500, err.message);
  }
}

async function getInventorySummary(req, res) {
  try {
    const { tenantId, companyId } = req;

    const [totalItems, balances, totalGroups, totalGodowns] = await Promise.all([
      StockItem.countDocuments({ tenant_id: tenantId, company_id: companyId, status: 'ACTIVE' }),
      StockBalance.find({ tenant_id: tenantId, company_id: companyId }),
      StockGroup.countDocuments({ tenant_id: tenantId, company_id: companyId, status: 'ACTIVE' }),
      Godown.countDocuments({ tenant_id: tenantId, company_id: companyId, status: 'ACTIVE' })
    ]);

    let totalQuantity = new BigNumber(0);
    let totalValuation = new BigNumber(0);

    for (const b of balances) {
      const q = new BigNumber(b.quantity_on_hand.toString());
      const v = new BigNumber(b.total_inventory_value.toString());
      totalQuantity = totalQuantity.plus(q);
      totalValuation = totalValuation.plus(v);
    }

    return res.success({
      total_items_tracked: totalItems,
      total_groups: totalGroups,
      total_godowns: totalGodowns,
      total_quantity_on_hand: totalQuantity.toFixed(4),
      total_inventory_valuation: totalValuation.toFixed(2),
      currency: req.company?.base_currency || 'INR',
      as_of_date: new Date().toISOString()
    });
  } catch (err) {
    return res.error('Failed to generate inventory summary', 500, err.message);
  }
}

// ==========================================
// 8. STOCK MOVEMENTS REGISTER
// ==========================================

async function getStockMovements(req, res) {
  try {
    const { tenantId, companyId } = req;
    const {
      page = 1,
      limit = 50,
      stock_item_id,
      godown_id,
      movement_type,
      start_date,
      end_date
    } = req.query;

    const filter = { tenant_id: tenantId, company_id: companyId };
    if (stock_item_id) filter.stock_item_id = stock_item_id;
    if (godown_id) filter.godown_id = godown_id;
    if (movement_type) filter.movement_type = movement_type.toUpperCase();

    if (start_date || end_date) {
      filter.movement_date = {};
      if (start_date) filter.movement_date.$gte = new Date(start_date);
      if (end_date) filter.movement_date.$lte = new Date(end_date);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('stock_item_id', 'item_code sku item_name')
        .populate('godown_id', 'godown_code godown_name')
        .populate('uom_id', 'unit_code symbol')
        .populate('base_uom_id', 'unit_code symbol')
        .populate('created_by', 'name email')
        .sort({ movement_date: -1, created_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockMovement.countDocuments(filter)
    ]);

    return res.success({
      movements,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    return res.error('Failed to fetch stock movements', 500, err.message);
  }
}

async function reverseMovement(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    const reversalMovement = await reverseStockMovement({
      tenantId,
      companyId,
      movementId: id,
      reason: reason || 'Manual reversal',
      userId: user?._id || null
    });

    return res.success({
      message: 'Stock movement reversed successfully',
      reversal_movement: reversalMovement.movement || reversalMovement
    });
  } catch (err) {
    return res.error('Failed to reverse stock movement', 400, err.message);
  }
}

// ==========================================
// 9. RECONCILIATION & BALANCE REBUILD
// ==========================================

async function reconcileBalances(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { stock_item_id } = req.body;

    const result = await rebuildStockBalances({
      tenantId,
      companyId,
      stockItemId: stock_item_id || null
    });

    return res.success({
      message: 'Stock balances successfully reconciled from immutable movement ledger',
      result
    });
  } catch (err) {
    return res.error('Failed to reconcile stock balances', 500, err.message);
  }
}

module.exports = {
  // Groups
  getStockGroups,
  getStockGroupById,
  createStockGroup,
  updateStockGroup,
  deleteStockGroup,

  // Categories
  getStockCategories,
  getStockCategoryById,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,

  // UOM
  getUnitsOfMeasurement,
  getUnitOfMeasurementById,
  createUnitOfMeasurement,
  updateUnitOfMeasurement,
  simulateUomConversion,

  // Godowns
  getGodowns,
  getGodownById,
  createGodown,
  updateGodown,

  // Items
  getStockItems,
  getStockItemById,
  createStockItem,
  updateStockItem,

  // Opening Stock
  postOpeningStock,

  // Balances & Summary
  getStockBalances,
  getInventorySummary,

  // Movements
  getStockMovements,
  reverseMovement,

  // Reconciliation
  reconcileBalances
};
