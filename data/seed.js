// Generates data/db.json with cities, agents, properties and reviews.
// Deterministic (seeded RNG) so every fresh install gets the same data.
// Run directly with `npm run seed` to regenerate (overwrites user reviews/enquiries).

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261029);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + rand() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const sample = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const roundTo = (n, step) => Math.round(n / step) * step;

// basePsf = typical sale price per sq ft (INR); rentPsf = monthly rent per sq ft.
// Locality multiplier adjusts for premium / affordable pockets.
const CITIES = [
  {
    id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', basePsf: 26000, rentPsf: 85,
    tagline: 'The city of dreams',
    localities: [['Bandra West', 1.9], ['Worli', 2.0], ['Andheri West', 1.2], ['Powai', 1.1], ['Goregaon East', 0.95], ['Malad West', 0.85], ['Chembur', 0.95], ['Thane West', 0.6], ['Kharghar', 0.45], ['Borivali West', 0.9]],
  },
  {
    id: 'delhi', name: 'New Delhi', state: 'Delhi', basePsf: 17000, rentPsf: 45,
    tagline: 'Heritage meets modern living',
    localities: [['Greater Kailash', 1.9], ['Vasant Kunj', 1.4], ['Saket', 1.5], ['Dwarka', 0.75], ['Rohini', 0.65], ['Janakpuri', 0.85], ['Lajpat Nagar', 1.3], ['Mayur Vihar', 0.7]],
  },
  {
    id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', basePsf: 10500, rentPsf: 38,
    tagline: 'India\'s Silicon Valley',
    localities: [['Koramangala', 1.6], ['Indiranagar', 1.7], ['HSR Layout', 1.35], ['Whitefield', 0.95], ['Electronic City', 0.65], ['Hebbal', 1.1], ['Sarjapur Road', 0.85], ['Jayanagar', 1.4], ['Yelahanka', 0.7]],
  },
  {
    id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', basePsf: 8500, rentPsf: 32,
    tagline: 'City of pearls and tech parks',
    localities: [['Banjara Hills', 1.8], ['Jubilee Hills', 1.9], ['Gachibowli', 1.25], ['Kondapur', 1.05], ['Madhapur', 1.2], ['Kokapet', 1.15], ['Kukatpally', 0.8], ['Miyapur', 0.7]],
  },
  {
    id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', basePsf: 8000, rentPsf: 30,
    tagline: 'Gateway to South India',
    localities: [['Adyar', 1.7], ['Anna Nagar', 1.5], ['T Nagar', 1.6], ['Velachery', 1.05], ['OMR', 0.8], ['Porur', 0.75], ['Tambaram', 0.55], ['ECR', 1.1]],
  },
  {
    id: 'pune', name: 'Pune', state: 'Maharashtra', basePsf: 8800, rentPsf: 32,
    tagline: 'Oxford of the East',
    localities: [['Koregaon Park', 1.7], ['Baner', 1.2], ['Kharadi', 1.05], ['Hinjewadi', 0.8], ['Wakad', 0.9], ['Viman Nagar', 1.25], ['Hadapsar', 0.8], ['Aundh', 1.3]],
  },
  {
    id: 'kolkata', name: 'Kolkata', state: 'West Bengal', basePsf: 6500, rentPsf: 24,
    tagline: 'The city of joy',
    localities: [['Ballygunge', 1.9], ['Salt Lake', 1.3], ['New Town', 0.95], ['Rajarhat', 0.8], ['Behala', 0.7], ['Alipore', 2.1], ['Tollygunge', 0.9]],
  },
  {
    id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', basePsf: 6000, rentPsf: 22,
    tagline: 'Heritage city on the Sabarmati',
    localities: [['SG Highway', 1.25], ['Prahlad Nagar', 1.3], ['Satellite', 1.2], ['Bopal', 0.85], ['Gota', 0.75], ['Thaltej', 1.35], ['Chandkheda', 0.65]],
  },
  {
    id: 'gurugram', name: 'Gurugram', state: 'Haryana', basePsf: 13000, rentPsf: 40,
    tagline: 'Millennium City',
    localities: [['Golf Course Road', 1.9], ['DLF Phase 5', 1.7], ['Sohna Road', 0.85], ['Sector 56', 1.0], ['Dwarka Expressway', 0.95], ['New Gurgaon', 0.75]],
  },
  {
    id: 'noida', name: 'Noida', state: 'Uttar Pradesh', basePsf: 8500, rentPsf: 28,
    tagline: 'Planned city of the NCR',
    localities: [['Sector 150', 1.1], ['Sector 50', 1.25], ['Sector 137', 0.9], ['Noida Extension', 0.6], ['Sector 62', 0.95], ['Sector 18', 1.3]],
  },
];

// Approximate map coordinates [lat, lng] for each city centre and locality.
const COORDS = {
  mumbai: { center: [19.076, 72.8777], 'Bandra West': [19.0596, 72.8295], Worli: [19.0176, 72.8174], 'Andheri West': [19.1364, 72.8296], Powai: [19.1176, 72.906], 'Goregaon East': [19.1663, 72.8526], 'Malad West': [19.1874, 72.8484], Chembur: [19.0522, 72.9005], 'Thane West': [19.2183, 72.9781], Kharghar: [19.0473, 73.0699], 'Borivali West': [19.2307, 72.8567] },
  delhi: { center: [28.6139, 77.209], 'Greater Kailash': [28.5482, 77.238], 'Vasant Kunj': [28.52, 77.159], Saket: [28.5245, 77.2066], Dwarka: [28.5921, 77.046], Rohini: [28.7495, 77.0565], Janakpuri: [28.6219, 77.0878], 'Lajpat Nagar': [28.5677, 77.2433], 'Mayur Vihar': [28.6077, 77.294] },
  bengaluru: { center: [12.9716, 77.5946], Koramangala: [12.9352, 77.6245], Indiranagar: [12.9784, 77.6408], 'HSR Layout': [12.9116, 77.6474], Whitefield: [12.9698, 77.75], 'Electronic City': [12.8452, 77.6602], Hebbal: [13.0358, 77.597], 'Sarjapur Road': [12.91, 77.687], Jayanagar: [12.9308, 77.5838], Yelahanka: [13.1007, 77.5963] },
  hyderabad: { center: [17.385, 78.4867], 'Banjara Hills': [17.4126, 78.4482], 'Jubilee Hills': [17.4325, 78.4073], Gachibowli: [17.4401, 78.3489], Kondapur: [17.46, 78.357], Madhapur: [17.4483, 78.3915], Kokapet: [17.3964, 78.327], Kukatpally: [17.4849, 78.4138], Miyapur: [17.4968, 78.3614] },
  chennai: { center: [13.0827, 80.2707], Adyar: [13.0012, 80.2565], 'Anna Nagar': [13.085, 80.2101], 'T Nagar': [13.0418, 80.2341], Velachery: [12.9815, 80.218], OMR: [12.901, 80.2279], Porur: [13.0382, 80.1565], Tambaram: [12.9249, 80.1], ECR: [12.87, 80.25] },
  pune: { center: [18.5204, 73.8567], 'Koregaon Park': [18.5362, 73.894], Baner: [18.559, 73.7868], Kharadi: [18.5515, 73.9348], Hinjewadi: [18.5913, 73.7389], Wakad: [18.5975, 73.77], 'Viman Nagar': [18.5679, 73.9143], Hadapsar: [18.5089, 73.926], Aundh: [18.558, 73.8075] },
  kolkata: { center: [22.5726, 88.3639], Ballygunge: [22.5276, 88.364], 'Salt Lake': [22.5867, 88.4171], 'New Town': [22.5807, 88.46], Rajarhat: [22.62, 88.45], Behala: [22.4986, 88.3104], Alipore: [22.533, 88.33], Tollygunge: [22.4981, 88.3459] },
  ahmedabad: { center: [23.0225, 72.5714], 'SG Highway': [23.03, 72.507], 'Prahlad Nagar': [23.012, 72.5108], Satellite: [23.0258, 72.525], Bopal: [23.033, 72.465], Gota: [23.1, 72.54], Thaltej: [23.05, 72.51], Chandkheda: [23.11, 72.585] },
  gurugram: { center: [28.4595, 77.0266], 'Golf Course Road': [28.456, 77.096], 'DLF Phase 5': [28.441, 77.088], 'Sohna Road': [28.407, 77.045], 'Sector 56': [28.423, 77.105], 'Dwarka Expressway': [28.48, 76.995], 'New Gurgaon': [28.4, 76.98] },
  noida: { center: [28.5355, 77.391], 'Sector 150': [28.43, 77.48], 'Sector 50': [28.57, 77.37], 'Sector 137': [28.51, 77.405], 'Noida Extension': [28.6, 77.43], 'Sector 62': [28.627, 77.365], 'Sector 18': [28.57, 77.326] },
};

const PROPERTY_TYPES = ['Apartment', 'Independent House', 'Villa', 'Builder Floor', 'Plot', 'Office Space', 'Shop'];
const RESIDENTIAL = ['Apartment', 'Independent House', 'Villa', 'Builder Floor'];
const COMMERCIAL = ['Office Space', 'Shop'];

const AMENITIES = ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'Gym', 'Swimming Pool', 'Clubhouse', 'Children\'s Play Area', 'Garden', 'Intercom', 'Rainwater Harvesting', 'Gas Pipeline', 'CCTV', 'Jogging Track', 'Visitor Parking', 'Fire Safety'];
const FURNISHING = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'];
const FACING = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East'];

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Rohan', 'Arjun', 'Karan', 'Rahul', 'Siddharth', 'Vikram', 'Nikhil', 'Ananya', 'Priya', 'Sneha', 'Kavya', 'Meera', 'Isha', 'Pooja', 'Neha', 'Divya', 'Riya', 'Sanjay', 'Suresh', 'Ramesh', 'Farhan', 'Imran', 'Zoya', 'Ayesha', 'Harpreet', 'Gurpreet', 'Manish', 'Deepak', 'Lakshmi', 'Venkat', 'Arun', 'Anil', 'Sunita', 'Tanvi', 'Yash', 'Kunal', 'Shreya'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Shah', 'Mehta', 'Gupta', 'Singh', 'Kapoor', 'Malhotra', 'Banerjee', 'Chatterjee', 'Das', 'Rao', 'Pillai', 'Joshi', 'Kulkarni', 'Deshpande', 'Khan', 'Sheikh', 'Agarwal', 'Bose', 'Menon', 'Kaur', 'Chopra', 'Jain'];
const AGENCY_WORDS = ['Prime', 'Urban', 'Skyline', 'Heritage', 'Landmark', 'Keystone', 'Nest', 'Metro', 'Royal', 'Elite', 'Harbour', 'Greenfield', 'Cornerstone', 'Horizon'];
const AGENCY_SUFFIX = ['Realty', 'Properties', 'Estates', 'Homes', 'Realtors', 'Property Consultants'];
const LANGS_BY_CITY = {
  mumbai: ['Marathi', 'Gujarati'], delhi: ['Punjabi', 'Urdu'], bengaluru: ['Kannada', 'Tamil', 'Telugu'],
  hyderabad: ['Telugu', 'Urdu'], chennai: ['Tamil', 'Malayalam'], pune: ['Marathi'], kolkata: ['Bengali'],
  ahmedabad: ['Gujarati'], gurugram: ['Punjabi', 'Haryanvi'], noida: ['Punjabi'],
};
const SPECIALIZATIONS = ['Residential Sales', 'Rentals', 'Luxury Homes', 'Commercial', 'Plots & Land', 'New Projects', 'NRI Services'];
const PROJECT_WORDS = ['Green', 'Palm', 'Lake', 'Royal', 'Silver', 'Golden', 'Emerald', 'Sapphire', 'Sunrise', 'Orchid', 'Lotus', 'Crest', 'Meadows', 'Heights', 'Residency', 'Enclave', 'Towers', 'Gardens', 'Vista', 'Park'];

const REVIEW_TEMPLATES = {
  5: ['Extremely professional and patient. Showed us many options and negotiated a great deal.', 'Handled all the paperwork smoothly, including the registration. Highly recommended!', 'Very transparent about pricing and never pushed us. Found our home within two weeks.', 'Knows the locality inside out. Got us a rental that fit our budget perfectly.'],
  4: ['Good experience overall. Responsive on WhatsApp and arranged visits quickly.', 'Helpful and knowledgeable, though a couple of listings were already taken.', 'Solid negotiation skills. Documentation took a bit longer than expected.'],
  3: ['Decent service, but follow-ups were slow at times.', 'Okay experience. Options shown were a bit above our stated budget.'],
  2: ['Communication was inconsistent and visits got rescheduled often.'],
  1: ['Did not respond after the initial site visit.'],
};

function reviewRating(quality) {
  // quality ~ 3.6..4.9 skews the distribution per agent
  const r = rand();
  if (r < (quality - 3.5) / 1.6) return 5;
  if (r < 0.85) return 4;
  if (r < 0.95) return 3;
  return rand() < 0.6 ? 2 : 1;
}

function isoDaysAgo(days) {
  const d = new Date('2026-10-29T10:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function personName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

function buildAgents() {
  const agents = [];
  let n = 1;
  for (const city of CITIES) {
    const count = intBetween(5, 7);
    for (let i = 0; i < count; i++) {
      const name = personName();
      const quality = between(3.6, 4.95);
      const reviewCount = intBetween(4, 9);
      const reviews = [];
      for (let r = 0; r < reviewCount; r++) {
        const rating = reviewRating(quality);
        reviews.push({
          id: `r${n}-${r + 1}`,
          author: personName(),
          rating,
          comment: pick(REVIEW_TEMPLATES[rating]),
          date: isoDaysAgo(intBetween(3, 700)),
        });
      }
      reviews.sort((a, b) => b.date.localeCompare(a.date));
      const experienceYears = intBetween(2, 22);
      const slug = name.toLowerCase().replace(/\s+/g, '.');
      agents.push({
        id: `a${n}`,
        name,
        agency: `${pick(AGENCY_WORDS)} ${pick(AGENCY_SUFFIX)}`,
        city: city.id,
        localities: sample(city.localities.map((l) => l[0]), intBetween(2, 4)),
        experienceYears,
        dealsClosed: Math.round(experienceYears * between(8, 30)),
        languages: ['English', 'Hindi', ...sample(LANGS_BY_CITY[city.id], intBetween(0, 2))],
        specializations: sample(SPECIALIZATIONS, intBetween(2, 4)),
        reraNumber: `RERA/${city.state.slice(0, 3).toUpperCase()}/AG/${intBetween(10000, 99999)}`,
        phone: `+91 9${intBetween(100000000, 999999999)}`,
        email: `${slug}@example.in`,
        responseTime: pick(['Within 1 hour', 'Within 2 hours', 'Same day', 'Within 30 minutes']),
        verified: rand() > 0.2,
        memberSince: 2026 - intBetween(1, Math.min(experienceYears, 10)),
        about: `${name.split(' ')[0]} has ${experienceYears} years of experience helping families and professionals buy, sell and rent property in ${city.name}. Known for honest advice and hands-on support from site visits to registration.`,
        reviews,
      });
      n++;
    }
  }
  return agents;
}

function describe(p, city) {
  const bits = [];
  if (p.bhk) bits.push(`This ${p.bhk} BHK ${p.propertyType.toLowerCase()}`);
  else bits.push(`This ${p.propertyType.toLowerCase()}`);
  bits.push(`in ${p.locality}, ${city.name} offers ${p.areaSqft.toLocaleString('en-IN')} sq ft of ${p.propertyType === 'Plot' ? 'clear-title land' : 'well-planned space'}.`);
  if (p.furnishing && p.propertyType !== 'Plot') bits.push(`It is ${p.furnishing.toLowerCase()} and ${p.facing.toLowerCase()}-facing.`);
  bits.push(`Close to schools, hospitals, shopping and public transport, with easy connectivity to the rest of ${city.name}.`);
  if (p.listingType === 'rent') bits.push(`Available for ${pick(['families', 'families and working professionals', 'bachelors and families', 'company lease'])}.`);
  return bits.join(' ');
}

function buildProperties(agents) {
  const properties = [];
  let n = 1;
  for (const city of CITIES) {
    const cityAgents = agents.filter((a) => a.city === city.id);
    const count = intBetween(40, 50);
    for (let i = 0; i < count; i++) {
      const [locality, mult] = pick(city.localities);
      const listingType = rand() < 0.55 ? 'sale' : 'rent';
      const r = rand();
      let propertyType;
      if (r < 0.62) propertyType = 'Apartment';
      else if (r < 0.72) propertyType = 'Builder Floor';
      else if (r < 0.79) propertyType = 'Independent House';
      else if (r < 0.84) propertyType = 'Villa';
      else if (r < 0.9) propertyType = listingType === 'sale' ? 'Plot' : 'Apartment';
      else propertyType = pick(COMMERCIAL);

      const residential = RESIDENTIAL.includes(propertyType);
      let bhk = null;
      let area;
      if (residential) {
        bhk = propertyType === 'Villa' ? intBetween(3, 5) : pick([1, 2, 2, 2, 3, 3, 3, 4]);
        area = roundTo(bhk * between(380, 560) + (propertyType === 'Villa' ? 900 : 0), 10);
      } else if (propertyType === 'Plot') {
        area = roundTo(between(900, 4000), 50);
      } else {
        area = roundTo(between(250, 3000), 10);
      }

      const typeMult = { Villa: 1.25, 'Independent House': 1.1, Plot: 0.7, Shop: 1.4, 'Office Space': 1.05 }[propertyType] || 1;
      // Most listings sit near market; ~12% are underpriced deals and ~12% are overpriced.
      const roll = rand();
      const pricing = roll < 0.12 ? between(0.72, 0.88) : roll > 0.88 ? between(1.12, 1.32) : between(0.94, 1.06);
      const psf = city.basePsf * mult * typeMult * pricing;
      let price;
      let deposit = null;
      if (listingType === 'sale') {
        price = roundTo(psf * area, 100000);
      } else {
        price = roundTo(city.rentPsf * mult * typeMult * area * pricing, 500);
        deposit = price * pick([2, 3, 3, 6, 10]);
      }

      const totalFloors = propertyType === 'Apartment' || propertyType === 'Office Space' ? intBetween(4, 40) : propertyType === 'Builder Floor' ? 4 : propertyType === 'Plot' ? null : intBetween(1, 3);
      const underConstruction = listingType === 'sale' && propertyType === 'Apartment' && rand() < 0.25;
      const project = `${pick(PROJECT_WORDS)} ${pick(PROJECT_WORDS)}`;
      const titleType = bhk ? `${bhk} BHK ${propertyType}` : propertyType;

      const [lat, lng] = COORDS[city.id][locality];
      const p = {
        id: `p${n}`,
        lat: Number((lat + between(-0.007, 0.007)).toFixed(5)),
        lng: Number((lng + between(-0.007, 0.007)).toFixed(5)),
        title: `${titleType} in ${locality}`,
        project: propertyType === 'Apartment' || propertyType === 'Office Space' ? project : null,
        listingType,
        propertyType,
        bhk,
        bathrooms: bhk ? Math.max(1, bhk - (rand() < 0.4 ? 1 : 0)) : propertyType === 'Plot' ? null : intBetween(1, 2),
        balconies: bhk ? intBetween(0, Math.min(3, bhk)) : null,
        areaSqft: area,
        price,
        deposit,
        pricePerSqft: listingType === 'sale' ? Math.round(price / area) : null,
        city: city.id,
        locality,
        address: `${project}, ${locality}, ${city.name}`,
        furnishing: propertyType === 'Plot' ? null : pick(FURNISHING),
        floor: totalFloors ? intBetween(0, totalFloors) : null,
        totalFloors,
        facing: pick(FACING),
        status: underConstruction ? 'Under Construction' : 'Ready to Move',
        possession: underConstruction ? `Dec ${2026 + intBetween(1, 3)}` : null,
        ageYears: underConstruction || propertyType === 'Plot' ? null : intBetween(0, 20),
        amenities: propertyType === 'Plot' ? sample(['Gated Community', 'Water Connection', 'Electricity Connection', 'Boundary Wall', 'Street Lights'], 3) : sample(AMENITIES, intBetween(4, 10)),
        reraId: listingType === 'sale' && (underConstruction || rand() < 0.4) ? `P${intBetween(10000000000, 99999999999)}` : null,
        postedOn: isoDaysAgo(intBetween(0, 120)),
        verified: rand() > 0.3,
        featured: rand() < 0.12,
        views: intBetween(40, 4000),
        agentId: pick(cityAgents).id,
        imageSeed: intBetween(0, 7),
      };
      p.description = describe(p, city);
      properties.push(p);
      n++;
    }
  }
  return properties;
}

function buildDb() {
  const agents = buildAgents();
  const properties = buildProperties(agents);
  return {
    cities: CITIES.map(({ localities, ...c }) => ({
      ...c,
      center: COORDS[c.id].center,
      localities: localities.map((l) => l[0]),
      localityCoords: Object.fromEntries(localities.map((l) => [l[0], COORDS[c.id][l[0]]])),
    })),
    propertyTypes: PROPERTY_TYPES,
    amenities: AMENITIES,
    agents,
    properties,
    enquiries: [],
  };
}

function ensureDb({ force = false } = {}) {
  if (!force && fs.existsSync(DB_PATH)) return;
  // Uploaded ownership documents belong to the applications being wiped.
  fs.rmSync(path.join(__dirname, 'uploads'), { recursive: true, force: true });
  const db = buildDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`Seeded ${db.properties.length} properties and ${db.agents.length} agents across ${db.cities.length} cities -> ${DB_PATH}`);
}

if (require.main === module) {
  ensureDb({ force: process.argv.includes('--force') });
}

module.exports = { ensureDb, DB_PATH };
