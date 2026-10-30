import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import {
  Building,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Briefcase,
  Globe,
  Calendar,
  CalendarDays,
  DollarSign,
  AlertCircle,
  Package,
  Layers,
  Sliders,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Factory,
  UtensilsCrossed,
  Cpu,
  Sparkles,
  CheckCircle2,
  Pencil
} from 'lucide-react';

const PROFILE_LABELS = {
  GENERAL_RETAIL: { label: 'General Retail', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  HARDWARE: { label: 'Hardware Store', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  GROCERY: { label: 'Grocery / Kirana', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  WHOLESALE_DISTRIBUTION: { label: 'Wholesale / Dist.', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  RESTAURANT_CAFE: { label: 'Restaurant / Cafe', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  PIZZA_QSR: { label: 'Pizza / QSR', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  HOTEL_HOSPITALITY: { label: 'Hotel / Hospitality', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  MANUFACTURING: { label: 'Manufacturing', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  PROFESSIONAL_SERVICES: { label: 'Professional Svcs', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  CUSTOM_OTHER: { label: 'Custom Business', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
};

const DEFAULT_OPERATING_MODELS = [
  { id: 'BUY_AND_RESELL', name: 'Buy & Resell / Trading', desc: 'Standard procurement and merchant sales without transformation.' },
  { id: 'WHOLESALE_DISTRIBUTION', name: 'Wholesale & Distribution', desc: 'B2B volume sales, tiered pricing, dispatch notes, and credit terms.' },
  { id: 'RETAIL_POS', name: 'Retail Store & Counter POS', desc: 'Instant checkout cashiering, barcode scanning, shift management.' },
  { id: 'MAKE_TO_STOCK', name: 'Make to Stock (MTS)', desc: 'Discrete manufacturing with forecast-driven production orders and BOM.' },
  { id: 'MAKE_TO_ORDER', name: 'Make to Order (MTO)', desc: 'Custom fabrication triggered directly upon sales order confirmation.' },
  { id: 'ASSEMBLE_TO_ORDER', name: 'Assemble to Order (ATO)', desc: 'Modular kitting and serial-tracked subassembly integration.' },
  { id: 'ENGINEER_TO_ORDER', name: 'Engineer to Order (ETO)', desc: 'Custom project engineering with milestone billing and job costing.' },
  { id: 'BATCH_PROCESS', name: 'Batch / Process Manufacturing', desc: 'Recipe formula production with batch yields, loss, and expiry control.' },
  { id: 'FOOD_SERVICE', name: 'Food Service & Restaurant', desc: 'Dine-in tables, KOT tickets, recipe auto-deduction, waste logs.' },
  { id: 'HYBRID', name: 'Multi-Model Hybrid Enterprise', desc: 'Multi-channel enterprise combining manufacturing, wholesale and retail.' }
];

const DEFAULT_INDUSTRIES = [
  {
    code: 'FOOD_BEVERAGE',
    name: 'Food & Beverage',
    category: 'PROCESS_AND_HOSPITALITY',
    description: 'Bakeries, dairy, breweries, confectionery, packaged foods, and restaurants.',
    subcategories: [
      'Pizza & Fast Food Services',
      'Restaurant, Dine-in & Cafe',
      'Commercial Bakery & Confectionery',
      'Dairy & Cheese Processing',
      'Breweries, Wineries & Distilleries',
      'Snack Foods & Packaged Goods',
      'Beverages, Juices & Soft Drinks',
      'Meat, Poultry & Seafood Processing'
    ],
    default_operating_models: ['FOOD_SERVICE', 'RETAIL_POS', 'BATCH_PROCESS']
  },
  {
    code: 'HARDWARE_METAL',
    name: 'Hardware & Metal Fabrication',
    category: 'DISCRETE_MANUFACTURING_TRADING',
    description: 'Fasteners, sheet metal, structural steel, tools, plumbing hardware, and CNC machining.',
    subcategories: [
      'Industrial Fasteners & Hardware',
      'Sheet Metal Fabrication & Stamping',
      'Structural Steel & Rebar Products',
      'Pipes, Valves & Plumbing Fittings',
      'Hand & Power Tools Distribution',
      'Precision CNC Machined Parts'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION', 'MAKE_TO_STOCK']
  },
  {
    code: 'ELECTRONICS_ELECTRICAL',
    name: 'Electronics & Electrical Products',
    category: 'ASSEMBLY_AND_TECHNOLOGY',
    description: 'Consumer electronics, PCBA assembly, electrical equipment, cables, and IoT devices.',
    subcategories: [
      'Consumer Electronics & Gadgets',
      'Printed Circuit Board Assembly (PCBA)',
      'Electrical Cables, Wires & Switchgear',
      'Sensors, IoT & Embedded Systems',
      'Power Supplies, Inverters & Batteries',
      'Computer Hardware & Peripherals'
    ],
    default_operating_models: ['ASSEMBLE_TO_ORDER', 'WHOLESALE_DISTRIBUTION']
  },
  {
    code: 'FURNITURE_WOOD',
    name: 'Furniture & Wood Products',
    category: 'DISCRETE_MANUFACTURING_TRADING',
    description: 'Residential & office furniture, cabinetry, architectural millwork, and timber trading.',
    subcategories: [
      'Home & Residential Furniture',
      'Commercial & Office Workstations',
      'Modular Kitchens & Cabinetry',
      'Timber, Plywood & Veneer Trading',
      'Architectural Millwork & Doors'
    ],
    default_operating_models: ['MAKE_TO_ORDER', 'BUY_AND_RESELL']
  },
  {
    code: 'TEXTILES_APPAREL',
    name: 'Textiles, Apparel & Footwear',
    category: 'CONSUMER_GOODS',
    description: 'Garments, woven fabrics, fashion accessories, leather products, and footwear.',
    subcategories: [
      'Ready-to-Wear Apparel & Fashion',
      'Woven, Knitted & Technical Textiles',
      'Footwear & Athletic Shoes',
      'Leather Goods & Accessories',
      'Home Textiles & Furnishings'
    ],
    default_operating_models: ['MAKE_TO_STOCK', 'WHOLESALE_DISTRIBUTION', 'RETAIL_POS']
  },
  {
    code: 'MACHINERY_EQUIPMENT',
    name: 'Machinery & Industrial Equipment',
    category: 'CAPITAL_GOODS',
    description: 'Pumps, compressors, packaging machinery, CNC machines, and agricultural implements.',
    subcategories: [
      'Pumps, Valves & Fluid Power',
      'Packaging & Material Handling Machinery',
      'Agricultural & Farm Equipment',
      'Industrial Compressors & Generators',
      'Machine Tools & Metalworking Machinery'
    ],
    default_operating_models: ['ENGINEER_TO_ORDER', 'MAKE_TO_ORDER']
  },
  {
    code: 'PLASTICS_PACKAGING',
    name: 'Plastics, Rubber & Packaging',
    category: 'PROCESS_AND_MANUFACTURING',
    description: 'Injection molding, corrugated boxes, flexible packaging films, and rubber seals.',
    subcategories: [
      'Plastic Injection & Blow Molding',
      'Corrugated Boxes & Cardboard Packaging',
      'Flexible Films & Pouches',
      'Rubber Seals, Gaskets & Extrusions'
    ],
    default_operating_models: ['MAKE_TO_STOCK', 'MAKE_TO_ORDER']
  },
  {
    code: 'AUTOMOTIVE_PARTS',
    name: 'Automotive & Spare Parts',
    category: 'ENGINEERING_AND_AFTERMARKET',
    description: 'Auto components, engine spares, brakes, batteries, tires, and workshop assemblies.',
    subcategories: [
      'Engine, Transmission & Drivetrain Components',
      'Brake Systems, Suspension & Steering',
      'Auto Electrical, Sensors & Batteries',
      'Tires, Wheels & Rubber Parts',
      'Aftermarket Accessories & Body Panels'
    ],
    default_operating_models: ['WHOLESALE_DISTRIBUTION', 'BUY_AND_RESELL']
  },
  {
    code: 'PHARMACEUTICALS',
    name: 'Pharmaceuticals & Healthcare Products',
    category: 'LIFE_SCIENCES',
    description: 'Formulations, APIs, medical devices, diagnostic reagents, and OTC wellness items.',
    subcategories: [
      'Finished Dosage Formulations (Tablets, Syrups)',
      'Active Pharmaceutical Ingredients (APIs)',
      'Medical Devices & Surgical Consumables',
      'Diagnostic Kits & Laboratory Reagents',
      'Ayurvedic, Herbal & Nutraceutical Products'
    ],
    default_operating_models: ['BATCH_PROCESS', 'WHOLESALE_DISTRIBUTION']
  },
  {
    code: 'CONSTRUCTION_MATERIALS',
    name: 'Construction & Building Materials',
    category: 'BUILDING_AND_INFRASTRUCTURE',
    description: 'Cement, ready-mix concrete, ceramic tiles, sanitaryware, paints, and glass.',
    subcategories: [
      'Cement, Aggregates & Ready-Mix Concrete',
      'Ceramic Tiles, Granite & Natural Stone',
      'Sanitaryware & Bath Fittings',
      'Architectural Glass & Aluminum Sections',
      'Paints, Waterproofing & Construction Chemicals'
    ],
    default_operating_models: ['WHOLESALE_DISTRIBUTION', 'BUY_AND_RESELL']
  },
  {
    code: 'AGRICULTURE_PRODUCE',
    name: 'Agriculture, Farming & Fresh Produce',
    category: 'PRIMARY_AND_AGRI_BUSINESS',
    description: 'Grains, pulses, fresh fruits & vegetables, seeds, fertilizers, and cold storage.',
    subcategories: [
      'Grains, Cereals & Pulses Trading',
      'Fresh Fruits, Vegetables & Cold Chain',
      'Seeds, Hybrid Plantings & Tissue Culture',
      'Fertilizers, Pesticides & Soil Nutrients',
      'Dairy Farming & Livestock Management'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION']
  },
  {
    code: 'SUPERMARKET_GROCERY',
    name: 'Supermarket, Grocery & Kirana',
    category: 'RETAIL_AND_CONSUMER',
    description: 'Modern trade supermarkets, neighborhood kirana stores, FMCG retail, and convenience stores.',
    subcategories: [
      'Supermarkets & Hypermarket Stores',
      'Kirana & Neighborhood Grocery Stores',
      'Convenience & Q-Commerce Stores',
      'Organic & Specialty Food Retail'
    ],
    default_operating_models: ['RETAIL_POS', 'BUY_AND_RESELL']
  },
  {
    code: 'GENERAL_TRADING',
    name: 'General Trading, Wholesale & Resell',
    category: 'COMMERCE_AND_DISTRIBUTION',
    description: 'Multi-category merchant trading, import-export, wholesale distribution, and retail merchant resell.',
    subcategories: [
      'B2B Wholesale Merchant Distributorship',
      'Import-Export & Indenting Trading',
      'Multi-Brand Consumer Goods Trading',
      'Commercial Supplies & Institutional Merchant'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION']
  },
  {
    code: 'CHEMICALS_PETRO',
    name: 'Chemicals, Petrochemicals & Coatings',
    category: 'PROCESS_AND_MANUFACTURING',
    description: 'Industrial solvents, specialty chemicals, polymers, lubricants, and coatings.',
    subcategories: [
      'Specialty & Fine Chemicals',
      'Industrial Solvents & Cleaning Chemicals',
      'Polymers, Resins & Compounds',
      'Lubricants, Greases & Petrochemical Derivatives'
    ],
    default_operating_models: ['BATCH_PROCESS', 'WHOLESALE_DISTRIBUTION']
  },
  {
    code: 'PAPER_PRINTING',
    name: 'Paper, Printing & Publishing',
    category: 'PROCESS_AND_COMMUNICATION',
    description: 'Paper mills, commercial offset printing, stationery manufacturing, and book publishing.',
    subcategories: [
      'Commercial Offset & Digital Printing',
      'Paper Mill & Board Manufacturing',
      'Packaging Printing & Labels',
      'Stationery & Office Paper Products'
    ],
    default_operating_models: ['MAKE_TO_ORDER', 'MAKE_TO_STOCK']
  },
  {
    code: 'JEWELRY_LUXURY',
    name: 'Jewelry, Precious Metals & Luxury Goods',
    category: 'HIGH_VALUE_DISCRETE',
    description: 'Gold & silver ornaments, diamond jewelry, gemstones, and watches.',
    subcategories: [
      'Precious Metal Jewelry (Gold, Silver, Platinum)',
      'Diamond & Gemstone Studded Jewelry',
      'Loose Diamonds, Pearls & Gemstones Trading',
      'Bullion & Precious Coins'
    ],
    default_operating_models: ['MAKE_TO_ORDER', 'RETAIL_POS']
  },
  {
    code: 'TOYS_SPORTING',
    name: 'Toys, Games & Sporting Goods',
    category: 'CONSUMER_GOODS',
    description: 'Educational toys, board games, sports gear, fitness equipment, and bicycles.',
    subcategories: [
      'Educational & Plastic Molded Toys',
      'Sports Gear & Athletic Equipment',
      'Fitness & Gym Machinery',
      'Bicycles & Wheeled Goods'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'RETAIL_POS']
  },
  {
    code: 'PROFESSIONAL_SERVICES',
    name: 'Professional Services, IT & Consulting',
    category: 'SERVICES_AND_CONSULTING',
    description: 'Software development, IT consulting, accounting firms, and legal advisory.',
    subcategories: [
      'Software Development & SaaS Product Companies',
      'IT Support & Managed Infrastructure',
      'Accounting, Taxation & Financial Advisory',
      'Management & Strategic Consulting'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'ENGINEER_TO_ORDER']
  },
  {
    code: 'LOGISTICS_TRANSPORT',
    name: 'Logistics, Freight & Warehousing',
    category: 'SUPPLY_CHAIN_SERVICES',
    description: '3PL warehousing, fleet transport, cold storage, and freight forwarding.',
    subcategories: [
      'Third-Party Warehousing & Fulfillment (3PL)',
      'Road Freight & Fleet Transportation',
      'Cold Chain Warehousing & Transport',
      'Express Courier & Parcel Distribution'
    ],
    default_operating_models: ['WHOLESALE_DISTRIBUTION', 'BUY_AND_RESELL']
  },
  {
    code: 'CUSTOM_OTHER',
    name: 'Other / Custom Business',
    category: 'FLEXIBLE_ENTERPRISE',
    description: 'Customized business enterprise with flexible inventory and accounting parameters.',
    subcategories: [
      'Multi-Disciplinary Conglomerate',
      'Custom Operational Workflow Enterprise'
    ],
    default_operating_models: ['HYBRID']
  }
];

export default function CompanySelector() {
  const { currentCompany, availableCompanies, switchCompany, createCompany, updateCompany } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const dropdownRef = useRef(null);

  // Taxonomy from backend, pre-populated with full canonical catalog fallback
  const [taxonomyIndustries, setTaxonomyIndustries] = useState(DEFAULT_INDUSTRIES);
  const [taxonomyModels, setTaxonomyModels] = useState(DEFAULT_OPERATING_MODELS);

  // Form state
  const [formData, setFormData] = useState({
    company_code: '',
    company_name: '',
    legal_name: '',
    business_profile: 'GENERAL_RETAIL',
    base_currency: 'USD',
    country_code: 'US',
    financial_year_start_month: 1
  });

  // Industry & Operating Model State
  const [selectedIndustry, setSelectedIndustry] = useState('GENERAL_TRADING');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedOperatingModels, setSelectedOperatingModels] = useState(['BUY_AND_RESELL']);
  const [industrySearch, setIndustrySearch] = useState('');
  const [recommendations, setRecommendations] = useState(null);

  // Calendar configuration state
  const [calendarChoice, setCalendarChoice] = useState('GREGORIAN');
  const [calendarForm, setCalendarForm] = useState({
    fiscal_year_start_month: 1,
    retail_pattern: 'RETAIL_445',
    anchor_month: 1,
    week_end_day: 'SATURDAY',
    year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
    fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
  });

  const resetForm = () => {
    setStep(1);
    setFormData({
      company_code: '',
      company_name: '',
      legal_name: '',
      business_profile: 'GENERAL_RETAIL',
      base_currency: 'USD',
      country_code: 'US',
      financial_year_start_month: 1
    });
    setSelectedIndustry('GENERAL_TRADING');
    setSelectedSubcategory('');
    setSelectedOperatingModels(['BUY_AND_RESELL']);
    setIndustrySearch('');
    setRecommendations(null);
    setCalendarChoice('GREGORIAN');
    setCalendarForm({
      fiscal_year_start_month: 1,
      retail_pattern: 'RETAIL_445',
      anchor_month: 1,
      week_end_day: 'SATURDAY',
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    });
    setError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setEditMode(false);
    setEditingCompanyId(null);
    setDropdownOpen(false);
    setModalOpen(true);
  };

  const openEditModal = (c) => {
    if (!c) return;
    setError(null);
    setStep(1);
    setEditMode(true);
    setEditingCompanyId(c.id || c._id);
    setFormData({
      company_code: c.company_code || '',
      company_name: c.company_name || '',
      legal_name: c.legal_name || c.company_name || '',
      description: c.description || '',
      business_profile: c.business_profile || 'GENERAL_RETAIL',
      base_currency: c.base_currency || 'USD',
      country_code: c.country_code || 'US',
      financial_year_start_month: c.financial_year_start_month || 1
    });

    const isFood = (c.business_profile === 'PIZZA_QSR' || c.business_profile === 'RESTAURANT_CAFE' || (c.company_name && /pizza|food|restaurant|cafe/i.test(c.company_name)));
    const isHardware = (c.business_profile === 'HARDWARE' || (c.company_name && /hardware|metal|fastener/i.test(c.company_name)));
    const isElectronics = (c.business_profile === 'ELECTRONICS' || (c.company_name && /electronic|circuit|device/i.test(c.company_name)));

    const indCode = c.industry_code || (isFood ? 'FOOD_BEVERAGE' : isHardware ? 'HARDWARE_METAL' : isElectronics ? 'ELECTRONICS_ELECTRICAL' : 'GENERAL_TRADING');
    setSelectedIndustry(indCode);
    setSelectedSubcategory(c.industry_subcategory || (isFood ? 'Pizza & Fast Food Services' : isHardware ? 'Industrial Fasteners & Hardware' : ''));
    setSelectedOperatingModels(
      Array.isArray(c.operating_models) && c.operating_models.length > 0
        ? c.operating_models
        : (isFood ? ['FOOD_SERVICE', 'RETAIL_POS'] : isHardware ? ['BUY_AND_RESELL'] : ['BUY_AND_RESELL'])
    );
    setIndustrySearch('');
    setDropdownOpen(false);
    setModalOpen(true);
  };

  // Fetch taxonomy on mount
  useEffect(() => {
    async function loadTaxonomy() {
      try {
        const res = await authApi.getIndustriesTaxonomy();
        if (res.success && res.data) {
          if (Array.isArray(res.data.industries) && res.data.industries.length > 0) {
            setTaxonomyIndustries(res.data.industries);
          }
          if (Array.isArray(res.data.operating_models) && res.data.operating_models.length > 0) {
            setTaxonomyModels(res.data.operating_models.map(m => ({ id: m.id, name: m.name, desc: m.description })));
          }
        }
      } catch (err) {
        console.warn('Failed to load industry taxonomy:', err.message);
      }
    }
    loadTaxonomy();
  }, []);

  // Update recommendations whenever industry, operating models, or country changes
  useEffect(() => {
    async function fetchRecs() {
      try {
        const res = await authApi.getIndustryRecommendations({
          industry_code: selectedIndustry,
          operating_models: selectedOperatingModels,
          country_code: formData.country_code
        });
        if (res.success && res.data) {
          setRecommendations(res.data);
        }
      } catch (err) {
        // Fallback default
        setRecommendations({
          industry_code: selectedIndustry,
          recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING'],
          inventory_policy: {
            tracking_mode: 'STANDARD',
            require_batch: false,
            require_serial: false,
            require_expiry: false,
            enable_quarantine: false,
            default_costing_method: 'MOVING_AVERAGE'
          }
        });
      }
    }
    fetchRecs();
  }, [selectedIndustry, selectedOperatingModels, formData.country_code]);

  // Sync subcategories when industry changes
  useEffect(() => {
    const curInd = taxonomyIndustries.find(i => i.code === selectedIndustry);
    if (curInd && Array.isArray(curInd.subcategories) && curInd.subcategories.length > 0) {
      if (!selectedSubcategory || !curInd.subcategories.includes(selectedSubcategory)) {
        setSelectedSubcategory(curInd.subcategories[0]);
      }
    } else {
      setSelectedSubcategory('');
    }
  }, [selectedIndustry, taxonomyIndustries]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchCompany = async (companyId) => {
    if (companyId === currentCompany?.id) {
      setDropdownOpen(false);
      return;
    }
    setLoading(true);
    try {
      await switchCompany(companyId);
      setDropdownOpen(false);
    } catch (err) {
      alert(`Failed to switch company: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleOperatingModel = (modelId) => {
    setSelectedOperatingModels(prev => {
      if (prev.includes(modelId)) {
        if (prev.length === 1) return prev; // At least one model required
        return prev.filter(m => m !== modelId);
      } else {
        return [...prev, modelId];
      }
    });
  };

  const getCalendarPreview = () => {
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (calendarChoice === 'GREGORIAN') {
      const startM = monthNames[Number(calendarForm.fiscal_year_start_month)] || 'January';
      return {
        title: 'Gregorian Calendar (12 Monthly Periods)',
        periodCount: '12 Monthly Accounting Periods',
        ruleSummary: `Fiscal year commences on the 1st of ${startM} and concludes on the last calendar day of the 12th month.`,
        tag: 'Standard GL'
      };
    } else if (calendarChoice === 'RETAIL_12') {
      const patternName = calendarForm.retail_pattern === 'RETAIL_445' ? '4-4-5 Pattern' : calendarForm.retail_pattern === 'RETAIL_454' ? '4-5-4 Pattern' : '5-4-4 Pattern';
      const anchorM = monthNames[Number(calendarForm.anchor_month)] || 'January';
      const ruleDesc = calendarForm.year_end_rule === 'LAST_WEEKDAY_OF_MONTH'
        ? `Last ${calendarForm.week_end_day.toLowerCase()} of ${anchorM}`
        : `Closest ${calendarForm.week_end_day.toLowerCase()} to ${anchorM} end`;
      return {
        title: `Retail 12-Period (${patternName})`,
        periodCount: '12 Period Fiscal Year (52 or 53 Weeks)',
        ruleSummary: `Week ends on ${calendarForm.week_end_day}. Anchored to ${ruleDesc}. 53rd week policy: ${calendarForm.fifty_three_week_policy === 'ADD_TO_LAST_PERIOD' ? 'Added to Period 12' : 'Dedicated 13th Period'}.`,
        tag: 'NRF Standard'
      };
    } else if (calendarChoice === 'RETAIL_13') {
      const anchorM = monthNames[Number(calendarForm.anchor_month)] || 'January';
      const ruleDesc = calendarForm.year_end_rule === 'LAST_WEEKDAY_OF_MONTH'
        ? `Last ${calendarForm.week_end_day.toLowerCase()} of ${anchorM}`
        : `Closest ${calendarForm.week_end_day.toLowerCase()} to ${anchorM} end`;
      return {
        title: 'Retail 13-Period Calendar (13 x 4-Week Periods)',
        periodCount: '13 Equal 4-Week Periods (52 or 53 Weeks)',
        ruleSummary: `Week ends on ${calendarForm.week_end_day}. Anchored to ${ruleDesc}. 53rd week policy: ${calendarForm.fifty_three_week_policy === 'ADD_TO_LAST_PERIOD' ? 'Added to Period 13' : 'Dedicated 14th Period'}.`,
        tag: 'Hospitality & QSR'
      };
    }
  };

  const handleCreateSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (editMode && editingCompanyId) {
        if (!formData.company_name || !formData.company_name.trim()) {
          throw new Error('Company Name is required.');
        }

        let calendarConfigPayload = undefined;
        if (calendarChoice === 'GREGORIAN') {
          calendarConfigPayload = {
            calendar_type: 'GREGORIAN',
            fiscal_year_start_month: Number(calendarForm.fiscal_year_start_month),
            year_end_rule: 'CALENDAR_MONTH_END'
          };
        }

        await updateCompany(editingCompanyId, {
          company_name: formData.company_name.trim(),
          legal_name: formData.legal_name?.trim() || undefined,
          description: formData.description?.trim() || undefined,
          industry_code: selectedIndustry,
          industry_subcategory: selectedSubcategory,
          operating_models: selectedOperatingModels,
          inventory_policies: recommendations?.inventory_policy || undefined,
          financial_year_start_month: Number(calendarForm.fiscal_year_start_month),
          calendar_config: calendarConfigPayload
        });
        setModalOpen(false);
        resetForm();
        return;
      }

      if (!formData.company_code || !formData.company_name) {
        throw new Error('Company Code and Company Name are required.');
      }
      if (!calendarChoice) {
        throw new Error('Accounting Calendar selection is mandatory.');
      }

      let calendarConfigPayload = null;
      if (calendarChoice === 'GREGORIAN') {
        calendarConfigPayload = {
          calendar_type: 'GREGORIAN',
          fiscal_year_start_month: Number(calendarForm.fiscal_year_start_month),
          year_end_rule: 'CALENDAR_MONTH_END'
        };
      } else if (calendarChoice === 'RETAIL_12') {
        calendarConfigPayload = {
          calendar_type: calendarForm.retail_pattern,
          anchor_month: Number(calendarForm.anchor_month),
          week_end_day: calendarForm.week_end_day,
          year_end_rule: calendarForm.year_end_rule,
          fifty_three_week_policy: calendarForm.fifty_three_week_policy
        };
      } else if (calendarChoice === 'RETAIL_13') {
        calendarConfigPayload = {
          calendar_type: 'RETAIL_13_PERIOD',
          anchor_month: Number(calendarForm.anchor_month),
          week_end_day: calendarForm.week_end_day,
          year_end_rule: calendarForm.year_end_rule,
          fifty_three_week_policy: calendarForm.fifty_three_week_policy
        };
      }

      await createCompany({
        ...formData,
        industry_code: selectedIndustry,
        industry_subcategory: selectedSubcategory,
        operating_models: selectedOperatingModels,
        inventory_policies: recommendations?.inventory_policy || undefined,
        financial_year_start_month: calendarChoice === 'GREGORIAN' ? Number(calendarForm.fiscal_year_start_month) : Number(calendarForm.anchor_month),
        calendar_config: calendarConfigPayload
      });
      setModalOpen(false);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredIndustries = taxonomyIndustries.filter(ind => {
    if (!industrySearch) return true;
    const q = industrySearch.toLowerCase();
    return (
      ind.name?.toLowerCase().includes(q) ||
      ind.description?.toLowerCase().includes(q) ||
      ind.category?.toLowerCase().includes(q) ||
      (Array.isArray(ind.subcategories) && ind.subcategories.some(s => s.toLowerCase().includes(q)))
    );
  });

  const selectedIndObj = taxonomyIndustries.find(i => i.code === selectedIndustry) || {
    name: selectedIndustry,
    description: 'Configurable enterprise',
    subcategories: []
  };

  const profileBadge = PROFILE_LABELS[currentCompany?.business_profile] || {
    label: currentCompany?.business_profile || 'Standard',
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Company Selector Button */}
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        disabled={loading}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-xs transition cursor-pointer"
        title="Active Company Context"
      >
        <Building className="w-3.5 h-3.5 text-indigo-400" />
        <div className="text-left flex items-center space-x-1.5">
          <span className="font-semibold text-slate-200">
            {currentCompany ? currentCompany.company_name : 'No Company Selected'}
          </span>
          {currentCompany && (
            <>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1 py-0.2 rounded">
                [{currentCompany.company_code}]
              </span>
              <span className={`px-1.5 py-0.2 text-[9px] font-mono font-medium rounded border ${profileBadge.color}`}>
                {profileBadge.label}
              </span>
            </>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute left-0 mt-2 w-80 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
          <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Active Companies ({availableCompanies.length})
            </span>
            <div className="flex items-center space-x-2">
              {currentCompany && (
                <button
                  type="button"
                  onClick={() => openEditModal(currentCompany)}
                  className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-brand-300 font-medium transition cursor-pointer"
                  title="Edit Active Company Profile"
                >
                  <Pencil className="w-3 h-3 text-slate-400 hover:text-brand-300" />
                  <span>Edit Active</span>
                </button>
              )}
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center space-x-1 text-[11px] text-brand-400 hover:text-brand-300 font-medium transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New Company</span>
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {availableCompanies.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-slate-500">
                No active companies found.
              </div>
            ) : (
              availableCompanies.map((c) => {
                const isSelected = currentCompany?.id === c.id;
                const cBadge = PROFILE_LABELS[c.business_profile] || {
                  label: c.business_profile,
                  color: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                };
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSwitchCompany(c.id)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between transition group/comp ${
                      isSelected
                        ? 'bg-brand-950/40 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col flex-1 min-w-0 mr-2">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="text-xs truncate">{c.company_name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({c.company_code})</span>
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className={`text-[9px] px-1 py-0.2 rounded border ${cBadge.color}`}>
                          {cBadge.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {c.base_currency}
                        </span>
                        {c.industry_code && (
                          <span className="text-[9px] font-mono text-brand-400/90 truncate max-w-[120px]">
                            • {c.industry_code}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(c);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                        title={`Edit ${c.company_name} details & industry`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isSelected && <Check className="w-4 h-4 text-brand-400 ml-0.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 4-Step Industry & Business Setup Wizard Modal */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Step Indicator */}
            <div className="px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-900 rounded-t-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="h-8 w-8 bg-brand-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-brand-500/20">
                    {editMode ? <Pencil className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {editMode ? `Edit Company: ${formData.company_name || formData.company_code}` : 'Industry-Driven Business Setup Wizard'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {editMode
                        ? 'Update company industry vertical, operating models, and inventory policies'
                        : 'Configurable ERP, Dynamic Inventory & Unified Accounting Engine'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setModalOpen(false);
                  }}
                  className="text-slate-400 hover:text-white transition p-1 rounded-md hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stepper Progress Bar */}
              <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800/80">
                {[
                  { num: 1, label: '1. Basic & Calendar', icon: Building },
                  { num: 2, label: '2. Industry Vertical', icon: Factory },
                  { num: 3, label: '3. Operating Model', icon: Sliders },
                  { num: 4, label: '4. Review & Activate', icon: ShieldCheck }
                ].map(s => {
                  const Icon = s.icon;
                  const isActive = step === s.num;
                  const isDone = step > s.num;
                  return (
                    <button
                      key={s.num}
                      type="button"
                      onClick={() => setStep(s.num)}
                      className={`flex items-center space-x-1.5 py-1 px-2 rounded-lg text-left transition text-[11px] ${
                        isActive
                          ? 'bg-brand-500/20 text-brand-300 font-bold border border-brand-500/40'
                          : isDone
                          ? 'text-emerald-400 hover:bg-slate-800 font-medium'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* STEP 1: Basic Information & Accounting Calendar */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400">
                          Company Code *
                        </label>
                        {editMode && (
                          <span className="text-[10px] text-amber-400 font-mono font-medium">Immutable</span>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        disabled={editMode}
                        maxLength={10}
                        placeholder="e.g. HDW01"
                        value={formData.company_code}
                        onChange={(e) => setFormData({ ...formData, company_code: e.target.value.toUpperCase() })}
                        className={`w-full px-3 py-2 rounded-lg ${
                          editMode ? 'bg-slate-950/70 text-slate-400 cursor-not-allowed border-slate-800' : 'bg-slate-800 text-white border-slate-700'
                        } border text-xs font-mono uppercase focus:outline-none focus:border-brand-500`}
                      />
                      <span className="text-[10px] text-slate-500">
                        {editMode ? 'Company Code cannot be changed once created' : 'Unique alphanumeric code'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                        Base Currency *
                      </label>
                      <select
                        value={formData.base_currency}
                        onChange={(e) => setFormData({ ...formData, base_currency: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="INR">INR (₹)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="AED">AED (AED)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Hardware & Industrial Supplies"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                        Legal / Registered Entity Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Apex Hardware Trading Enterprises LLC"
                        value={formData.legal_name}
                        onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                        Country Code & Tax Regime *
                      </label>
                      <select
                        value={formData.country_code}
                        onChange={(e) => setFormData({ ...formData, country_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="US">US - United States (Sales & Use Tax)</option>
                        <option value="IN">IN - India (GST Multi-Tier)</option>
                        <option value="GB">GB - United Kingdom (VAT)</option>
                        <option value="CA">CA - Canada (GST/PST)</option>
                        <option value="AE">AE - United Arab Emirates (VAT)</option>
                      </select>
                    </div>
                  </div>

                  {/* Accounting Calendar */}
                  <div className="pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <CalendarDays className="w-4 h-4 text-brand-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Accounting Calendar Selection *
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                        Mandatory
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                      <div
                        onClick={() => setCalendarChoice('GREGORIAN')}
                        className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                          calendarChoice === 'GREGORIAN'
                            ? 'bg-brand-500/10 border-brand-500/50 text-white shadow-sm ring-1 ring-brand-500/30'
                            : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs text-brand-400 mb-1">A. Gregorian (12 M)</div>
                        <p className="text-[10px] text-slate-400">12 Monthly periods with custom fiscal start month.</p>
                      </div>

                      <div
                        onClick={() => setCalendarChoice('RETAIL_12')}
                        className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                          calendarChoice === 'RETAIL_12'
                            ? 'bg-brand-500/10 border-brand-500/50 text-white shadow-sm ring-1 ring-brand-500/30'
                            : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs text-brand-400 mb-1">B. Retail 12 (4-4-5)</div>
                        <p className="text-[10px] text-slate-400">NRF week-based accounting with 53rd week leap policy.</p>
                      </div>

                      <div
                        onClick={() => setCalendarChoice('RETAIL_13')}
                        className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                          calendarChoice === 'RETAIL_13'
                            ? 'bg-brand-500/10 border-brand-500/50 text-white shadow-sm ring-1 ring-brand-500/30'
                            : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs text-brand-400 mb-1">C. Retail 13 (13x4W)</div>
                        <p className="text-[10px] text-slate-400">13 uniform 4-week periods for restaurant and fast-turn cycles.</p>
                      </div>
                    </div>

                    {/* Preview banner */}
                    {(() => {
                      const prev = getCalendarPreview();
                      return (
                        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300">
                          <span className="font-semibold text-brand-400">{prev.title}: </span>
                          <span>{prev.ruleSummary}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* STEP 2: Industry & Vertical Selection */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                      <Factory className="w-4 h-4 text-brand-400" />
                      <span>Select Industry Classification & Specialization</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Choose from standard industry categories to automatically configure inventory tracking, workflows, and modules.
                    </p>
                  </div>

                  {/* Primary Industry Dropdown Selector Panel */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>1. Industry Classification *</span>
                          <span className="text-[10px] text-brand-400 font-sans font-medium">Select from dropdown</span>
                        </label>
                        <select
                          value={selectedIndustry}
                          onChange={(e) => {
                            const newCode = e.target.value;
                            setSelectedIndustry(newCode);
                            const matched = taxonomyIndustries.find(i => i.code === newCode);
                            if (matched) {
                              if (matched.default_operating_models && matched.default_operating_models.length > 0) {
                                setSelectedOperatingModels(matched.default_operating_models);
                              }
                              setSelectedSubcategory(matched.subcategories?.[0] || '');
                            }
                          }}
                          className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-brand-500/50 text-white text-xs font-semibold focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 shadow-sm cursor-pointer"
                        >
                          {taxonomyIndustries.map(ind => (
                            <option key={ind.code} value={ind.code} className="bg-slate-900 text-white py-1">
                              {ind.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>2. Specialization / Subcategory</span>
                          <span className="text-[10px] text-slate-400 font-sans font-normal">Optional</span>
                        </label>
                        <select
                          value={selectedSubcategory}
                          onChange={(e) => setSelectedSubcategory(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500 cursor-pointer"
                        >
                          <option value="">-- Standard / General {selectedIndObj.name} --</option>
                          {selectedIndObj.subcategories?.map(sub => (
                            <option key={sub} value={sub} className="bg-slate-900 text-white py-1">
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Active Selected Industry Banner */}
                    <div className="flex items-start space-x-2.5 text-[11px] text-slate-300 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                      <Sparkles className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white">{selectedIndObj.name}</span>
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                            {selectedIndObj.category?.replace(/_/g, ' ') || 'ACTIVE'}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[10px] mt-0.5 leading-relaxed">
                          {selectedIndObj.description || 'Configurable operational parameters applied.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Visual Card Grid with Search Header */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                        Or browse & click industry card ({filteredIndustries.length} available)
                      </span>
                      <input
                        type="text"
                        placeholder="Filter industries..."
                        value={industrySearch}
                        onChange={(e) => setIndustrySearch(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs w-52 focus:outline-none focus:border-brand-500 placeholder-slate-500"
                      />
                    </div>

                    {/* Industry Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {filteredIndustries.map(ind => {
                        const isSel = selectedIndustry === ind.code;
                        return (
                          <div
                            key={ind.code}
                            onClick={() => {
                              setSelectedIndustry(ind.code);
                              if (ind.default_operating_models && ind.default_operating_models.length > 0) {
                                setSelectedOperatingModels(ind.default_operating_models);
                              }
                              setSelectedSubcategory(ind.subcategories?.[0] || '');
                            }}
                            className={`p-3 rounded-lg border cursor-pointer transition text-left flex flex-col justify-between ${
                              isSel
                                ? 'bg-brand-500/15 border-brand-500 text-white ring-1 ring-brand-500/40 shadow-sm'
                                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800/90'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-xs text-white">{ind.name}</span>
                                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                                  {ind.category?.replace(/_/g, ' ') || 'GOODS'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{ind.description}</p>
                            </div>
                            {isSel && (
                              <div className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-medium">Active Selection</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Operating Models */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Select Operating Business Models</h4>
                    <p className="text-[11px] text-slate-400">Choose all channels and operations this company performs (Multi-select supported)</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                    {taxonomyModels.map(model => {
                      const isChecked = selectedOperatingModels.includes(model.id);
                      return (
                        <div
                          key={model.id}
                          onClick={() => toggleOperatingModel(model.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition flex items-start space-x-3 text-left ${
                            isChecked
                              ? 'bg-brand-500/15 border-brand-500 text-white ring-1 ring-brand-500/40'
                              : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            isChecked ? 'bg-brand-600 border-brand-500 text-white' : 'border-slate-600 bg-slate-900'
                          }`}>
                            {isChecked && <Check className="w-3 h-3" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white mb-0.5">{model.name}</div>
                            <p className="text-[10px] text-slate-400 leading-normal">{model.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 4: Live Capabilities & Configuration Review */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-brand-950/40 border border-brand-500/30 text-xs">
                    <div className="flex items-center space-x-2 text-brand-300 font-bold mb-1">
                      <Sparkles className="w-4 h-4 text-brand-400" />
                      <span>Ready to Initialize Company Workspace</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      The configuration engine has determined the ideal accounting and inventory setup for <strong>{formData.company_name || 'your company'}</strong>.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                      <div className="font-mono text-[10px] uppercase text-slate-400">Industry & Models</div>
                      <div className="font-bold text-white text-xs">{selectedIndObj.name}</div>
                      {selectedSubcategory && (
                        <div className="text-[11px] text-slate-400 italic">Specialization: {selectedSubcategory}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedOperatingModels.map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 text-[9px] font-mono">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                      <div className="font-mono text-[10px] uppercase text-slate-400">Inventory Tracking Policies</div>
                      <div className="space-y-1 text-[11px] text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Tracking Mode:</span>
                          <span className="font-mono font-bold text-white">{recommendations?.inventory_policy?.tracking_mode || 'STANDARD'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Costing Method:</span>
                          <span className="font-mono text-white">{recommendations?.inventory_policy?.default_costing_method || 'MOVING_AVERAGE'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Batch / Expiry:</span>
                          <span className="text-white">{recommendations?.inventory_policy?.require_batch ? 'Enforced ✓' : 'Optional'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Serial Tracking:</span>
                          <span className="text-white">{recommendations?.inventory_policy?.require_serial ? 'Active ✓' : 'Disabled'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modules enabled */}
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase text-slate-400">Auto-Enabled Business Modules</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Dependencies Verified</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(recommendations?.recommended_modules || ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING']).map(mod => (
                        <span key={mod} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono text-[10px] flex items-center space-x-1">
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{mod}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer with Stepper Navigation */}
            <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between shrink-0 bg-slate-900 rounded-b-xl">
              <div>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition"
                >
                  Cancel
                </button>

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1 && (!formData.company_code || !formData.company_name)) {
                        setError('Please enter Company Code and Company Name to proceed.');
                        return;
                      }
                      setError(null);
                      setStep(step + 1);
                    }}
                    className="flex items-center space-x-1 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 transition"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    disabled={loading}
                    className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {loading
                        ? (editMode ? 'Updating Profile...' : 'Initializing...')
                        : (editMode ? 'Save & Update Company Profile' : 'Initialize Company & Books')}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
