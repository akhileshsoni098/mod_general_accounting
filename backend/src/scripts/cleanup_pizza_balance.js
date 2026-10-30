require('dotenv').config();
const { connectDB } = require('../config/db');

async function run() {
  await connectDB();
  const { StockBalance, StockItem, StockMovement } = require('../models');
  const pizza = await StockItem.findOne({ item_code: 'FG-PIZZA-01' });
  if (pizza) {
    const delBal = await StockBalance.deleteMany({ stock_item_id: pizza._id });
    console.log('Deleted StockBalances:', delBal.deletedCount);

    const delMov = await StockMovement.deleteMany({
      stock_item_id: pizza._id,
      movement_type: { $in: ['SALES_RETURN', 'SPOILAGE_DISPOSAL'] }
    });
    console.log('Deleted Movements:', delMov.deletedCount);
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
