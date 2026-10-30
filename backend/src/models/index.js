const Tenant = require('./Tenant');
const User = require('./User');
const TenantMembership = require('./TenantMembership');
const Role = require('./Role');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');
const UserRole = require('./UserRole');
const TenantModuleEntitlement = require('./TenantModuleEntitlement');
const Party = require('./Party');
const PartyRole = require('./PartyRole');
const UserSession = require('./UserSession');
const PasswordResetToken = require('./PasswordResetToken');
const Company = require('./Company');
const CompanyMembership = require('./CompanyMembership');

// SaaS Platform & Subscriptions
const SubscriptionPlan = require('./SubscriptionPlan');
const TenantSubscription = require('./TenantSubscription');
const PlatformAuditLog = require('./PlatformAuditLog');

// Module: Inventory & Stock Management (Phase 3 - 7 Models)
const StockGroup = require('./StockGroup');
const StockCategory = require('./StockCategory');
const UnitOfMeasurement = require('./UnitOfMeasurement');
const Godown = require('./Godown');
const StockItem = require('./StockItem');
const StockMovement = require('./StockMovement');
const StockBalance = require('./StockBalance');

// Module: Commercial Transactions, Invoicing, Tax & Posting (Phase 4 - 4 Models)
const CommercialDocument = require('./CommercialDocument');
const BillAllocation = require('./BillAllocation');
const CompanyPostingConfig = require('./CompanyPostingConfig');
const TaxRateConfig = require('./TaxRateConfig');

// Module: US Tax & Jurisdictions (Phase 2, 3, 5)
const TaxJurisdiction = require('./TaxJurisdiction');
const CompanyTaxProfile = require('./CompanyTaxProfile');
const TaxRegistration = require('./TaxRegistration');
const NexusReview = require('./NexusReview');
const TaxProviderSyncLog = require('./TaxProviderSyncLog');
const TaxCalculationSnapshot = require('./TaxCalculationSnapshot');
const TaxReturnPeriod = require('./TaxReturnPeriod');
const TaxLiabilityEntry = require('./TaxLiabilityEntry');
const TaxReturn = require('./TaxReturn');
const TaxPaymentRecord = require('./TaxPaymentRecord');

// Industry Modules: Retail, Hospitality, Food & Manufacturing
const PosShift = require('./PosShift');
const RecipeBOM = require('./RecipeBOM');
const RestaurantTable = require('./RestaurantTable');
const RestaurantOrder = require('./RestaurantOrder');
const StoreLocation = require('./StoreLocation');
const RestaurantConfig = require('./RestaurantConfig');
const ModifierGroup = require('./ModifierGroup');
const ProductVariant = require('./ProductVariant');
const HotelRoomType = require('./HotelRoomType');
const HotelRoom = require('./HotelRoom');
const HotelReservation = require('./HotelReservation');
const GuestFolio = require('./GuestFolio');
const ManufacturingBOM = require('./ManufacturingBOM');
const WorkOrder = require('./WorkOrder');

// Module 14: Core General Ledger (7 Models)
const LedgerAccount = require('./LedgerAccount');
const FiscalPeriod = require('./FiscalPeriod');
const AccountingCalendar = require('./AccountingCalendar');
const PostingRule = require('./PostingRule');
const PostingRuleLine = require('./PostingRuleLine');
const EventDefinition = require('./EventDefinition');
const PostingRuleTestCase = require('./PostingRuleTestCase');
const OutboxEvent = require('./OutboxEvent');
const InboxMessage = require('./InboxMessage');
const EventSubscription = require('./EventSubscription');
const Journal = require('./Journal');
const JournalEntry = require('./JournalEntry');
const ExchangeRate = require('./ExchangeRate');
const DimensionDefinition = require('./DimensionDefinition');
const OpeningBalanceSetup = require('./OpeningBalanceSetup');

// Module 12: Billing & Accounts Receivable (9 Models)
const BillingPlan = require('./BillingPlan');
const BillingAccount = require('./BillingAccount');
const BillingAccountPolicy = require('./BillingAccountPolicy');
const InstallmentSchedule = require('./InstallmentSchedule');
const Invoice = require('./Invoice');
const InvoiceLine = require('./InvoiceLine');
const Payment = require('./Payment');
const PaymentAllocation = require('./PaymentAllocation');
const BillingAdjustment = require('./BillingAdjustment');

// Module 40: Treasury, Cash & Bank Reconciliation (12 Models)
const PaymentMandate = require('./PaymentMandate');
const PaymentAttempt = require('./PaymentAttempt');
const ProcessorTransaction = require('./ProcessorTransaction');
const BankStatementLine = require('./BankStatementLine');
const CashReconciliationMatch = require('./CashReconciliationMatch');
const UnappliedCash = require('./UnappliedCash');
const PaymentReturn = require('./PaymentReturn');
const Refund = require('./Refund');
const DunningPlan = require('./DunningPlan');
const DelinquencyCase = require('./DelinquencyCase');
const DunningAction = require('./DunningAction');
const CollectionAssignment = require('./CollectionAssignment');

// Module 13: Commissions, Fiduciary Trust, Bordereaux & Carrier Settlements (11 Models)
const CommissionAgreement = require('./CommissionAgreement');
const CommissionSchedule = require('./CommissionSchedule');
const ProfitCommissionSchedule = require('./ProfitCommissionSchedule');
const CommissionSplit = require('./CommissionSplit');
const CommissionTransaction = require('./CommissionTransaction');
const FiduciaryAccount = require('./FiduciaryAccount');
const BordereauDefinition = require('./BordereauDefinition');
const BordereauRun = require('./BordereauRun');
const BordereauLine = require('./BordereauLine');
const SettlementStatement = require('./SettlementStatement');
const SettlementLine = require('./SettlementLine');

// Module 41: Finance Close, Reconciliation & ERP Export (8 Models)
const SubledgerBalance = require('./SubledgerBalance');
const ReconciliationCase = require('./ReconciliationCase');
const TrialBalanceSnapshot = require('./TrialBalanceSnapshot');
const TrialBalanceLine = require('./TrialBalanceLine');
const PeriodCloseTask = require('./PeriodCloseTask');
const GLExportBatch = require('./GLExportBatch');
const CommissionAdjustment = require('./CommissionAdjustment');
const CommissionDispute = require('./CommissionDispute');

// Extended ERP Modules: Pricing, Landed Cost, Interest, Job Work, Fixed Assets, Cheque Printing, TDS, Budgets, Payroll
const PriceList = require('./PriceList');
const LandedCostAllocation = require('./LandedCostAllocation');
const InterestRule = require('./InterestRule');
const JobWorkOrder = require('./JobWorkOrder');
const FixedAsset = require('./FixedAsset');
const ChequeLayout = require('./ChequeLayout');
const ChequeRegister = require('./ChequeRegister');
const TdsSection = require('./TdsSection');
const TdsDeduction = require('./TdsDeduction');
const BudgetDefinition = require('./BudgetDefinition');
const Employee = require('./Employee');
const SalaryStructure = require('./SalaryStructure');
const PayrollRun = require('./PayrollRun');

module.exports = {
  // Identity & Tenancy
  Tenant,
  User,
  TenantMembership,
  Role,
  Permission,
  RolePermission,
  UserRole,
  TenantModuleEntitlement,
  Party,
  PartyRole,
  UserSession,
  PasswordResetToken,
  Company,
  CompanyMembership,

  // Inventory & Stock Management
  StockGroup,
  StockCategory,
  UnitOfMeasurement,
  Godown,
  StockItem,
  StockMovement,
  StockBalance,

  // SaaS Platform & Subscriptions
  SubscriptionPlan,
  TenantSubscription,
  PlatformAuditLog,

  // Commercial Transactions, Invoicing, Tax & Posting (Phase 4)
  CommercialDocument,
  BillAllocation,
  CompanyPostingConfig,
  TaxRateConfig,

  // Industry Modules
  PosShift,
  RecipeBOM,
  RestaurantTable,
  RestaurantOrder,
  StoreLocation,
  RestaurantConfig,
  ModifierGroup,
  ProductVariant,
  HotelRoomType,
  HotelRoom,
  HotelReservation,
  GuestFolio,
  ManufacturingBOM,
  WorkOrder,

  // Core General Ledger
  LedgerAccount,
  FiscalPeriod,
  AccountingCalendar,
  PostingRule,
  PostingRuleLine,
  EventDefinition,
  PostingRuleTestCase,
  OutboxEvent,
  InboxMessage,
  EventSubscription,
  Journal,
  JournalEntry,
  ExchangeRate,
  DimensionDefinition,
  OpeningBalanceSetup,

  // Billing & Accounts Receivable
  BillingPlan,
  BillingAccount,
  BillingAccountPolicy,
  InstallmentSchedule,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  BillingAdjustment,

  // Treasury, Cash & Bank Reconciliation
  PaymentMandate,
  PaymentAttempt,
  ProcessorTransaction,
  BankStatementLine,
  CashReconciliationMatch,
  UnappliedCash,
  PaymentReturn,
  Refund,
  DunningPlan,
  DelinquencyCase,
  DunningAction,
  CollectionAssignment,

  // Commissions, Fiduciary Trust, Bordereaux & Settlements
  CommissionAgreement,
  CommissionSchedule,
  ProfitCommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  FiduciaryAccount,
  BordereauDefinition,
  BordereauRun,
  BordereauLine,
  SettlementStatement,
  SettlementLine,

  // Module 41: Finance Close, Reconciliation & ERP Export (8 Models)
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  CommissionAdjustment,
  CommissionDispute,

  // Extended ERP Models
  PriceList,
  LandedCostAllocation,
  InterestRule,
  JobWorkOrder,
  FixedAsset,
  ChequeLayout,
  ChequeRegister,
  TdsSection,
  TdsDeduction,
  BudgetDefinition,
  Employee,
  SalaryStructure,
  PayrollRun,

  // US Tax & Jurisdictions (Phase 2, 3, 5)
  TaxJurisdiction,
  CompanyTaxProfile,
  TaxRegistration,
  NexusReview,
  TaxProviderSyncLog,
  TaxCalculationSnapshot,
  TaxReturnPeriod,
  TaxLiabilityEntry,
  TaxReturn,
  TaxPaymentRecord
};
