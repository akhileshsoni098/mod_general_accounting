const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { StockItem } = require('../models');

  // 1. Classic Herb Pizza Sauce: Base is KG
  const item1 = await StockItem.findById('6ade00c9fc5bc2b90e0aea99');
  if (item1) {
    item1.purchase_uom_id = item1.base_uom_id;
    item1.sales_uom_id = item1.base_uom_id;
    await item1.save();
    console.log('Fixed Classic Herb Pizza Sauce:', item1.item_name, 'Base/Purch/Sales set to KG');
  }

  // 2. Salad: Base is KG
  const item2 = await StockItem.findById('6ae08a5dedde98febacf084c');
  if (item2) {
    item2.purchase_uom_id = item2.base_uom_id;
    item2.sales_uom_id = item2.base_uom_id;
    await item2.save();
    console.log('Fixed Salad:', item2.item_name, 'Base/Purch/Sales set to KG');
  }

  // 3. Bolt: Base is KG
  const item3 = await StockItem.findById('6ad7648b051faf94fe3d16c0');
  if (item3) {
    item3.purchase_uom_id = item3.base_uom_id;
    item3.sales_uom_id = item3.base_uom_id;
    await item3.save();
    console.log('Fixed Bolt:', item3.item_name, 'Base/Purch/Sales set to KG');
  }

  await mongoose.disconnect();
  console.log('Done fixing mismatched UOM records.');
}

run().catch(console.error);
