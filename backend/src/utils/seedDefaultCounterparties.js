const { Party, PartyRole } = require('../models');

const DEFAULT_COUNTERPARTIES = [
  // 1. Carriers
  {
    party_code: 'CARRIER-SUMMIT',
    legal_name: 'Summit Mutual Insurance Company',
    trade_name: 'Summit Mutual Group',
    party_type: 'ORGANIZATION',
    tax_id: '12-3456780',
    email: 'underwriting@summitmutual.com',
    phone: '212-555-0100',
    address: {
      street1: '100 Wall Street',
      city: 'New York',
      state: 'NY',
      postal_code: '10005',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'CARRIER',
    role_details: {
      naic_code: '23450',
      am_best_rating: 'A+',
      state_of_domicile: 'NY',
      paper_type: 'ADMITTED',
      remittance_split_pct: 80.0
    }
  },
  {
    party_code: 'CARRIER-SOUTHLAKE',
    legal_name: 'Southlake Specialty Insurance Company',
    trade_name: 'Southlake Specialty',
    party_type: 'ORGANIZATION',
    tax_id: '75-4422119',
    email: 'programs@southlakespecialty.com',
    phone: '817-555-0144',
    address: {
      street1: '1200 E Southlake Blvd',
      city: 'Southlake',
      state: 'TX',
      postal_code: '76092',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'CARRIER',
    role_details: {
      naic_code: '16832',
      am_best_rating: 'A',
      state_of_domicile: 'TX',
      paper_type: 'SURPLUS_LINES',
      remittance_split_pct: 82.5
    }
  },
  {
    party_code: 'CARRIER-CLEARSPRING',
    legal_name: 'ClearSpring Property & Casualty Company',
    trade_name: 'ClearSpring P&C',
    party_type: 'ORGANIZATION',
    tax_id: '36-8899221',
    email: 'commercial@clearspring.com',
    phone: '312-555-0188',
    address: {
      street1: '300 S Wacker Dr',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60606',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'CARRIER',
    role_details: {
      naic_code: '15563',
      am_best_rating: 'A-',
      state_of_domicile: 'TX',
      paper_type: 'ADMITTED',
      remittance_split_pct: 77.5
    }
  },

  // 2. Retail Brokers (Producers)
  {
    party_code: 'BROKER-BRIGHTLINE',
    legal_name: 'Brightline Retail Risk Agency LLC',
    trade_name: 'Brightline Agency',
    party_type: 'ORGANIZATION',
    tax_id: '75-9876543',
    email: 'producers@brightlineagency.com',
    phone: '214-555-0180',
    address: {
      street1: '2100 Ross Ave',
      city: 'Dallas',
      state: 'TX',
      postal_code: '75201',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'BROKER',
    role_details: {
      license_number: 'TX-BRK-9921',
      producer_tier: 'PLATINUM',
      commission_split_pct: 10.0
    }
  },
  {
    party_code: 'BROKER-LONESTAR',
    legal_name: 'Lone Star Freight Risk Agency Inc.',
    trade_name: 'Lone Star Risk',
    party_type: 'ORGANIZATION',
    tax_id: '74-3322110',
    email: 'service@lonestarrisk.com',
    phone: '713-555-0199',
    address: {
      street1: '1000 Louisiana St',
      city: 'Houston',
      state: 'TX',
      postal_code: '77002',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'BROKER',
    role_details: {
      license_number: 'TX-BRK-8842',
      producer_tier: 'GOLD',
      commission_split_pct: 10.0
    }
  },
  {
    party_code: 'BROKER-AUSTIN',
    legal_name: 'Austin Commercial Risk Partners LLC',
    trade_name: 'Austin Risk Partners',
    party_type: 'ORGANIZATION',
    tax_id: '74-5544332',
    email: 'commercial@austinrisk.com',
    phone: '512-555-0122',
    address: {
      street1: '500 W 2nd St',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'BROKER',
    role_details: {
      license_number: 'TX-BRK-7719',
      producer_tier: 'SILVER',
      commission_split_pct: 12.0
    }
  },

  // 3. Managing General Agent (MGA)
  {
    party_code: 'MGA-HARBOR',
    legal_name: 'Harbor Risk Underwriting Managers LLC',
    trade_name: 'Harbor Specialty MGA',
    party_type: 'ORGANIZATION',
    tax_id: '74-1234567',
    email: 'underwriting@harborspecialty.com',
    phone: '512-555-0150',
    address: {
      street1: '900 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'MGA',
    role_details: {
      underwriting_authority_limit: 5000000,
      agreement_ref: 'AGR-HARBOR-SUMMIT-2026',
      retained_commission_pct: 10.0
    }
  },

  // 4. Policyholder (Insured Customer)
  {
    party_code: 'POLICYHOLDER-LONEPINE',
    legal_name: 'Lone Pine Trucking LLC',
    trade_name: 'Lone Pine Freight',
    party_type: 'ORGANIZATION',
    tax_id: '74-9876543',
    email: 'dispatch@lonepinetrucking.com',
    phone: '432-555-0199',
    address: {
      street1: '400 W Wall St',
      city: 'Midland',
      state: 'TX',
      postal_code: '79701',
      country: 'USA'
    },
    status: 'ACTIVE',
    role_type: 'POLICYHOLDER',
    role_details: {
      dot_number: '3189201',
      mc_number: 'MC-992144',
      primary_line: 'COMMERCIAL_AUTO'
    }
  }
];

async function seedDefaultCounterparties(tenantId) {
  if (!tenantId) return [];

  const createdParties = [];

  for (const item of DEFAULT_COUNTERPARTIES) {
    const { role_type, role_details, ...partyProps } = item;

    let party = await Party.findOne({
      tenant_id: tenantId,
      party_code: partyProps.party_code
    });

    if (!party) {
      party = await Party.create({
        ...partyProps,
        tenant_id: tenantId
      });
    } else {
      party.legal_name = partyProps.legal_name;
      party.trade_name = partyProps.trade_name;
      party.email = partyProps.email;
      party.phone = partyProps.phone;
      party.address = partyProps.address;
      party.status = partyProps.status;
      await party.save();
    }

    if (role_type) {
      let role = await PartyRole.findOne({
        tenant_id: tenantId,
        party_id: party._id,
        role_type: role_type.toUpperCase()
      });

      if (!role) {
        role = await PartyRole.create({
          tenant_id: tenantId,
          party_id: party._id,
          role_type: role_type.toUpperCase(),
          status: 'ACTIVE',
          role_details: role_details || {}
        });
      } else {
        role.status = 'ACTIVE';
        role.role_details = { ...(role.role_details || {}), ...(role_details || {}) };
        await role.save();
      }
    }

    createdParties.push(party);
  }

  return createdParties;
}

module.exports = {
  DEFAULT_COUNTERPARTIES,
  seedDefaultCounterparties
};
