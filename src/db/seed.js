'use strict';
// Seed catalog for Shriram Caterers & Events.
// Recipe quantities are per 100 plates, in the ingredient's unit — sensible
// bulk-catering defaults meant to be tuned dish-by-dish in the UI.
// Idempotent: skips if packages already exist.

const { connect } = require('./db');

function seed(db) {
  db = db || connect();
  const has = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
  if (has > 0) { console.log('[seed] catalog already present, skipping'); return false; }

  // ── Ingredients: [en, hi, mr, unit, category, ₹/unit] ──
  const ING = [
    ['Wheat flour', 'गेहूँ का आटा', 'गव्हाचे पीठ', 'kg', 'grain', 40],
    ['Rice (Kolam)', 'चावल (कोलम)', 'तांदूळ (कोलम)', 'kg', 'grain', 60],
    ['Basmati rice', 'बासमती चावल', 'बासमती तांदूळ', 'kg', 'grain', 110],
    ['Semolina (rava)', 'सूजी', 'रवा', 'kg', 'grain', 50],
    ['Maida', 'मैदा', 'मैदा', 'kg', 'grain', 42],
    ['Jowar flour', 'ज्वार का आटा', 'ज्वारीचे पीठ', 'kg', 'grain', 55],
    ['Poha', 'पोहा', 'पोहे', 'kg', 'grain', 60],
    ['Toor dal', 'अरहर दाल', 'तूर डाळ', 'kg', 'pulse', 140],
    ['Chana dal', 'चना दाल', 'हरभरा डाळ', 'kg', 'pulse', 90],
    ['Moong dal', 'मूंग दाल', 'मूग डाळ', 'kg', 'pulse', 120],
    ['Matki (moth beans)', 'मोठ', 'मटकी', 'kg', 'pulse', 110],
    ['Chana (chickpeas)', 'काबुली चना', 'छोले (काबुली चणे)', 'kg', 'pulse', 90],
    ['Besan', 'बेसन', 'बेसन', 'kg', 'pulse', 90],
    ['Potato', 'आलू', 'बटाटा', 'kg', 'vegetable', 30],
    ['Onion', 'प्याज़', 'कांदा', 'kg', 'vegetable', 35],
    ['Tomato', 'टमाटर', 'टोमॅटो', 'kg', 'vegetable', 40],
    ['Brinjal', 'बैंगन', 'वांगी', 'kg', 'vegetable', 45],
    ['Cauliflower', 'फूलगोभी', 'फ्लॉवर', 'kg', 'vegetable', 40],
    ['Cabbage', 'पत्तागोभी', 'कोबी', 'kg', 'vegetable', 30],
    ['Green peas', 'हरी मटर', 'हिरवे वाटाणे', 'kg', 'vegetable', 80],
    ['Carrot', 'गाजर', 'गाजर', 'kg', 'vegetable', 50],
    ['Cucumber', 'खीरा', 'काकडी', 'kg', 'vegetable', 40],
    ['Green chili', 'हरी मिर्च', 'हिरवी मिरची', 'kg', 'vegetable', 80],
    ['Ginger', 'अदरक', 'आले', 'kg', 'vegetable', 120],
    ['Garlic', 'लहसुन', 'लसूण', 'kg', 'vegetable', 160],
    ['Coriander leaves', 'हरा धनिया', 'कोथिंबीर', 'kg', 'vegetable', 60],
    ['Mint', 'पुदीना', 'पुदिना', 'kg', 'vegetable', 60],
    ['Curry leaves', 'करी पत्ता', 'कढीपत्ता', 'kg', 'vegetable', 100],
    ['Lady finger', 'भिंडी', 'भेंडी', 'kg', 'vegetable', 60],
    ['Colocasia leaves', 'अरबी के पत्ते', 'अळूची पाने', 'pcs', 'vegetable', 3],
    ['Lemon', 'नींबू', 'लिंबू', 'pcs', 'vegetable', 5],
    ['Fresh coconut', 'नारियल', 'ओला नारळ', 'pcs', 'fruit', 30],
    ['Mango pulp', 'आम का पल्प', 'आंब्याचा रस', 'kg', 'fruit', 150],
    ['Milk', 'दूध', 'दूध', 'L', 'dairy', 60],
    ['Curd', 'दही', 'दही', 'kg', 'dairy', 80],
    ['Paneer', 'पनीर', 'पनीर', 'kg', 'dairy', 350],
    ['Ghee', 'घी', 'तूप', 'kg', 'dairy', 600],
    ['Butter', 'मक्खन', 'लोणी', 'kg', 'dairy', 500],
    ['Khoya', 'खोया', 'खवा', 'kg', 'dairy', 320],
    ['Cooking oil', 'खाने का तेल', 'खाद्यतेल', 'L', 'oil', 130],
    ['Salt', 'नमक', 'मीठ', 'kg', 'spice', 20],
    ['Turmeric', 'हल्दी', 'हळद', 'kg', 'spice', 250],
    ['Red chili powder', 'लाल मिर्च पाउडर', 'लाल तिखट', 'kg', 'spice', 350],
    ['Goda masala', 'गोडा मसाला', 'गोडा मसाला', 'kg', 'spice', 600],
    ['Garam masala', 'गरम मसाला', 'गरम मसाला', 'kg', 'spice', 700],
    ['Cumin seeds', 'जीरा', 'जिरे', 'kg', 'spice', 400],
    ['Mustard seeds', 'राई', 'मोहरी', 'kg', 'spice', 120],
    ['Coriander powder', 'धनिया पाउडर', 'धने पूड', 'kg', 'spice', 250],
    ['Asafoetida', 'हींग', 'हिंग', 'kg', 'spice', 2500],
    ['Cardamom', 'इलायची', 'वेलची', 'kg', 'spice', 3500],
    ['Cloves', 'लौंग', 'लवंग', 'kg', 'spice', 1200],
    ['Cinnamon', 'दालचीनी', 'दालचिनी', 'kg', 'spice', 800],
    ['Black pepper', 'काली मिर्च', 'काळी मिरी', 'kg', 'spice', 800],
    ['Bay leaf', 'तेजपत्ता', 'तमालपत्र', 'kg', 'spice', 400],
    ['Tamarind', 'इमली', 'चिंच', 'kg', 'spice', 150],
    ['Kokam', 'कोकम', 'कोकम', 'kg', 'spice', 300],
    ['Sesame seeds', 'तिल', 'तीळ', 'kg', 'spice', 200],
    ['Cashew', 'काजू', 'काजू', 'kg', 'dry_fruit', 800],
    ['Almonds', 'बादाम', 'बदाम', 'kg', 'dry_fruit', 750],
    ['Raisins', 'किशमिश', 'बेदाणे', 'kg', 'dry_fruit', 350],
    ['Dry coconut', 'सूखा नारियल', 'सुके खोबरे', 'kg', 'dry_fruit', 250],
    ['Peanuts', 'मूंगफली', 'शेंगदाणे', 'kg', 'dry_fruit', 130],
    ['Sugar', 'चीनी', 'साखर', 'kg', 'sweetener', 45],
    ['Jaggery', 'गुड़', 'गूळ', 'kg', 'sweetener', 60],
    ['Papad (ready)', 'पापड़', 'पापड', 'kg', 'other', 300],
    ['Pickle (ready)', 'अचार', 'लोणचे', 'kg', 'other', 200],
    ['LPG cylinder', 'गैस सिलेंडर', 'गॅस सिलेंडर', 'pcs', 'other', 1150],
    ['Disposable plates (patravali)', 'पत्तल', 'पत्रावळी', 'pcs', 'other', 4],
  ];
  const insIng = db.prepare('INSERT INTO ingredients (name_en,name_hi,name_mr,unit,category,market_rate) VALUES (?,?,?,?,?,?)');
  const ingId = {};
  for (const r of ING) ingId[r[0]] = Number(insIng.run(...r).lastInsertRowid);

  // ── Dishes: [en, hi, mr, category, addon ₹/plate, recipe {ingredient: qty per 100 plates}] ──
  const DISHES = [
    ['Puran Poli', 'पूरन पोली', 'पुरणपोळी', 'sweet', 35,
      { 'Chana dal': 7, Jaggery: 7, 'Wheat flour': 6, Ghee: 2, Cardamom: 0.05 }],
    ['Shrikhand', 'श्रीखंड', 'श्रीखंड', 'sweet', 30,
      { Curd: 18, Sugar: 4.5, Cardamom: 0.04, Almonds: 0.15 }],
    ['Amrakhand', 'आम्रखंड', 'आम्रखंड', 'sweet', 35,
      { Curd: 16, 'Mango pulp': 4, Sugar: 4, Cardamom: 0.03 }],
    ['Jilebi', 'जलेबी', 'जिलेबी', 'sweet', 25,
      { Maida: 5, Sugar: 6, 'Cooking oil': 3, Curd: 0.5 }],
    ['Gulab Jamun', 'गुलाब जामुन', 'गुलाबजाम', 'sweet', 30,
      { Khoya: 6, Maida: 1.5, Sugar: 7, Ghee: 2.5, Cardamom: 0.03 }],
    ['Basundi', 'बासुंदी', 'बासुंदी', 'sweet', 35,
      { Milk: 25, Sugar: 3, Cashew: 0.3, Almonds: 0.3, Cardamom: 0.03 }],
    ['Motichoor Laddu', 'मोतीचूर लड्डू', 'मोतीचूर लाडू', 'sweet', 30,
      { Besan: 5, Sugar: 6, Ghee: 3, Cashew: 0.2, Raisins: 0.2 }],

    ['Matki Usal', 'मोठ की उसल', 'मटकीची उसळ', 'main', 20,
      { 'Matki (moth beans)': 5, Onion: 3, 'Cooking oil': 1.2, 'Goda masala': 0.25, 'Red chili powder': 0.15, Jaggery: 0.3, 'Dry coconut': 0.5, Salt: 0.4 }],
    ['Batata Bhaji', 'आलू की सूखी सब्ज़ी', 'बटाट्याची भाजी', 'main', 15,
      { Potato: 12, 'Cooking oil': 1, 'Mustard seeds': 0.1, Turmeric: 0.05, 'Green chili': 0.4, 'Curry leaves': 0.1, 'Coriander leaves': 0.3, Salt: 0.4 }],
    ['Paneer Masala', 'पनीर मसाला', 'पनीर मसाला', 'main', 40,
      { Paneer: 7, Tomato: 6, Onion: 4, 'Cooking oil': 1.5, 'Garam masala': 0.2, Ginger: 0.3, Garlic: 0.3, Milk: 2, Salt: 0.4 }],
    ['Veg Kolhapuri', 'वेज कोल्हापुरी', 'व्हेज कोल्हापुरी', 'main', 30,
      { Cauliflower: 4, Carrot: 3, Potato: 3, 'Green peas': 2, Onion: 4, Tomato: 3, 'Dry coconut': 0.8, 'Red chili powder': 0.25, 'Garam masala': 0.2, 'Cooking oil': 1.5, Salt: 0.4 }],
    ['Bharli Vangi', 'भरवाँ बैंगन', 'भरली वांगी', 'main', 25,
      { Brinjal: 10, Peanuts: 1.5, 'Dry coconut': 0.8, 'Goda masala': 0.3, Jaggery: 0.3, 'Cooking oil': 1.5, Onion: 2, Salt: 0.4 }],
    ['Aloo Mutter', 'आलू मटर', 'बटाटा-वाटाणा रस्सा', 'main', 20,
      { Potato: 7, 'Green peas': 4, Tomato: 4, Onion: 3, 'Cooking oil': 1.2, 'Garam masala': 0.15, Salt: 0.4 }],
    ['Chhole', 'छोले', 'छोले', 'main', 25,
      { 'Chana (chickpeas)': 6, Onion: 4, Tomato: 5, 'Cooking oil': 1.5, 'Garam masala': 0.2, Ginger: 0.3, Garlic: 0.3, Salt: 0.4 }],
    ['Mixed Veg', 'मिक्स वेज', 'मिक्स भाजी', 'main', 20,
      { Cauliflower: 3, Carrot: 3, Cabbage: 3, 'Green peas': 2, Potato: 3, Onion: 3, Tomato: 3, 'Cooking oil': 1.5, 'Garam masala': 0.2, Salt: 0.4 }],

    ['Varan', 'सादी दाल', 'वरण', 'dal', 10,
      { 'Toor dal': 4, Turmeric: 0.03, Asafoetida: 0.02, Jaggery: 0.2, Salt: 0.4 }],
    ['Amti', 'महाराष्ट्रीयन आमटी', 'आमटी', 'dal', 12,
      { 'Toor dal': 4, 'Goda masala': 0.25, Jaggery: 0.3, Tamarind: 0.2, 'Dry coconut': 0.3, 'Cooking oil': 0.5, Salt: 0.4 }],
    ['Katachi Amti', 'कटाची आमटी', 'कटाची आमटी', 'dal', 12,
      { 'Chana dal': 1, 'Goda masala': 0.2, Tamarind: 0.3, Jaggery: 0.3, 'Dry coconut': 0.3, Salt: 0.3 }],
    ['Dal Fry', 'दाल फ्राई', 'दाल फ्राय', 'dal', 15,
      { 'Toor dal': 4.5, Onion: 2, Tomato: 2, Ghee: 0.8, 'Cumin seeds': 0.1, Garlic: 0.2, Salt: 0.4 }],

    ['Steamed Rice', 'सादा चावल', 'साधा भात', 'rice', 10,
      { 'Rice (Kolam)': 9, Salt: 0.2 }],
    ['Masale Bhat', 'मसाला चावल', 'मसाले भात', 'rice', 20,
      { 'Rice (Kolam)': 8, Brinjal: 2, 'Green peas': 1.5, 'Goda masala': 0.4, 'Cooking oil': 1.5, 'Dry coconut': 0.5, 'Coriander leaves': 0.3, Salt: 0.4 }],
    ['Jeera Rice', 'जीरा राइस', 'जिरा राईस', 'rice', 20,
      { 'Basmati rice': 8, 'Cumin seeds': 0.15, Ghee: 1, Salt: 0.3 }],
    ['Veg Pulao', 'वेज पुलाव', 'व्हेज पुलाव', 'rice', 25,
      { 'Basmati rice': 8, Carrot: 2, 'Green peas': 2, Ghee: 1.5, 'Garam masala': 0.15, Onion: 2, Salt: 0.4 }],
    ['Veg Biryani', 'वेज बिरयानी', 'व्हेज बिर्याणी', 'rice', 35,
      { 'Basmati rice': 9, Potato: 3, Cauliflower: 2, Carrot: 2, Curd: 2, Onion: 4, 'Cooking oil': 2, 'Garam masala': 0.3, Mint: 0.3, Salt: 0.5 }],

    ['Chapati', 'चपाती', 'चपाती / पोळी', 'bread', 10,
      { 'Wheat flour': 8, 'Cooking oil': 0.8, Salt: 0.15 }],
    ['Puri', 'पूरी', 'पुरी', 'bread', 12,
      { 'Wheat flour': 7, 'Cooking oil': 4 }],
    ['Bhakri', 'ज्वार की भाखरी', 'ज्वारीची भाकरी', 'bread', 12,
      { 'Jowar flour': 8, Salt: 0.15 }],
    ['Butter Naan', 'बटर नान', 'बटर नान', 'bread', 15,
      { Maida: 8, Butter: 1, Curd: 1, Milk: 1, Salt: 0.2 }],

    ['Batata Vada', 'बटाटा वड़ा', 'बटाटा वडा', 'snack', 20,
      { Potato: 10, Besan: 3, 'Cooking oil': 3, 'Green chili': 0.4, Ginger: 0.3, Garlic: 0.3, 'Mustard seeds': 0.1, Turmeric: 0.05, 'Curry leaves': 0.1, Salt: 0.4 }],
    ['Kothimbir Vadi', 'कोथिंबीर वड़ी', 'कोथिंबीर वडी', 'snack', 20,
      { 'Coriander leaves': 4, Besan: 4, 'Cooking oil': 2, 'Sesame seeds': 0.2, 'Green chili': 0.3, Salt: 0.3 }],
    ['Aluvadi', 'अरबी पत्ता रोल', 'अळूवडी', 'snack', 20,
      { 'Colocasia leaves': 200, Besan: 4, Tamarind: 0.3, Jaggery: 0.4, 'Cooking oil': 2, 'Sesame seeds': 0.2, Salt: 0.3 }],
    ['Samosa', 'समोसा', 'समोसा', 'snack', 20,
      { Maida: 5, Potato: 8, 'Green peas': 1.5, 'Cooking oil': 3.5, 'Cumin seeds': 0.1, 'Garam masala': 0.15, Salt: 0.4 }],
    ['Dhokla', 'ढोकला', 'ढोकळा', 'snack', 18,
      { Besan: 5, Curd: 1, 'Green chili': 0.2, 'Mustard seeds': 0.1, Sugar: 0.3, 'Cooking oil': 0.8, Salt: 0.3 }],
    ['Papad', 'पापड़', 'पापड', 'snack', 8,
      { 'Papad (ready)': 2 }],

    ['Koshimbir', 'खीरा-मूंगफली सलाद', 'काकडीची कोशिंबीर', 'salad', 12,
      { Cucumber: 6, Peanuts: 1.2, Curd: 2, 'Coriander leaves': 0.3, 'Green chili': 0.2, Salt: 0.3 }],
    ['Green Salad', 'हरा सलाद', 'ग्रीन सॅलड', 'salad', 12,
      { Cucumber: 4, Carrot: 3, Tomato: 3, Onion: 3, Lemon: 80 }],

    ['Thecha', 'ठेचा', 'ठेचा', 'condiment', 8,
      { 'Green chili': 1.5, Garlic: 0.8, Peanuts: 0.8, 'Cooking oil': 0.3, Salt: 0.2 }],
    ['Lonche', 'अचार', 'लोणचे', 'condiment', 8,
      { 'Pickle (ready)': 1.5 }],
    ['Curd Bowl', 'दही', 'दही', 'condiment', 10,
      { Curd: 8 }],
    ['Green Chutney', 'हरी चटनी', 'हिरवी चटणी', 'condiment', 8,
      { 'Coriander leaves': 2, Mint: 1, 'Green chili': 0.4, Peanuts: 0.5, Lemon: 30, Salt: 0.2 }],

    ['Masala Taak', 'मसाला छाछ', 'मसाला ताक', 'beverage', 12,
      { Curd: 10, 'Cumin seeds': 0.1, Salt: 0.2, 'Coriander leaves': 0.2, Ginger: 0.2 }],
    ['Solkadhi', 'सोलकढ़ी', 'सोलकढी', 'beverage', 15,
      { Kokam: 1, 'Fresh coconut': 40, 'Green chili': 0.2, Garlic: 0.2, Salt: 0.2 }],
  ];
  const insDish = db.prepare('INSERT INTO dishes (name_en,name_hi,name_mr,category,addon_price_per_plate) VALUES (?,?,?,?,?)');
  const insRec = db.prepare('INSERT INTO recipe_items (dish_id,ingredient_id,qty_per_100) VALUES (?,?,?)');
  const dishId = {};
  for (const [en, hi, mr, cat, addon, recipe] of DISHES) {
    const id = Number(insDish.run(en, hi, mr, cat, addon).lastInsertRowid);
    dishId[en] = id;
    for (const [ing, qty] of Object.entries(recipe || {})) {
      if (!ingId[ing]) throw new Error(`seed: unknown ingredient "${ing}" in dish "${en}"`);
      insRec.run(id, ingId[ing], qty);
    }
  }

  // ── Packages: three-tier thali structure ──
  const insPkg = db.prepare(`INSERT INTO packages
    (code,tier,name_en,name_hi,name_mr,desc_en,desc_hi,desc_mr,base_price_per_plate,min_guests) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insPkgDish = db.prepare('INSERT INTO package_dishes (package_id,dish_id) VALUES (?,?)');

  const PKGS = [
    ['SAATVIK', 1, 'Saatvik Thali', 'सात्विक थाली', 'सात्विक थाळी',
      'Simple, homely Maharashtrian meal — perfect for pujas and smaller functions.',
      'सादा घर जैसा महाराष्ट्रीयन भोजन — पूजा और छोटे कार्यक्रमों के लिए।',
      'साधे घरगुती महाराष्ट्रीयन जेवण — पूजा व लहान कार्यक्रमांसाठी उत्तम.',
      280, 100,
      ['Jilebi', 'Batata Bhaji', 'Matki Usal', 'Varan', 'Steamed Rice', 'Chapati', 'Koshimbir', 'Papad', 'Thecha', 'Masala Taak']],
    ['RAJWADI', 2, 'Rajwadi Thali', 'राजवाड़ी थाली', 'राजवाडी थाळी',
      'Festive wedding-grade thali with puran poli and two vegetables.',
      'पूरन पोली और दो सब्ज़ियों के साथ शादी लायक़ थाली।',
      'पुरणपोळी व दोन भाज्यांसह लग्नसराईची थाळी.',
      400, 100,
      ['Puran Poli', 'Jilebi', 'Paneer Masala', 'Bharli Vangi', 'Dal Fry', 'Masale Bhat', 'Steamed Rice', 'Puri', 'Chapati', 'Batata Vada', 'Koshimbir', 'Green Salad', 'Papad', 'Lonche', 'Masala Taak']],
    ['MAHARAJA', 3, 'Maharaja Thali', 'महाराजा थाली', 'महाराजा थाळी',
      'Royal spread: two sweets, three vegetables, biryani, live counters ready.',
      'शाही भोज: दो मिठाइयाँ, तीन सब्ज़ियाँ, बिरयानी।',
      'शाही मेजवानी: दोन गोड पदार्थ, तीन भाज्या, बिर्याणी.',
      550, 100,
      ['Gulab Jamun', 'Basundi', 'Veg Kolhapuri', 'Paneer Masala', 'Aloo Mutter', 'Amti', 'Veg Biryani', 'Jeera Rice', 'Puri', 'Butter Naan', 'Samosa', 'Kothimbir Vadi', 'Green Salad', 'Koshimbir', 'Curd Bowl', 'Green Chutney', 'Papad', 'Lonche', 'Solkadhi']],
  ];
  const pkgId = {};
  for (const [code, tier, ne, nh, nm, de, dh, dm, price, min, dishes] of PKGS) {
    const id = Number(insPkg.run(code, tier, ne, nh, nm, de, dh, dm, price, min).lastInsertRowid);
    pkgId[code] = id;
    for (const d of dishes) {
      if (!dishId[d]) throw new Error(`seed: unknown dish "${d}" in package ${code}`);
      insPkgDish.run(id, dishId[d]);
    }
  }

  // Global volume slabs (package_id NULL = all packages)
  const insSlab = db.prepare('INSERT INTO price_slabs (package_id,min_guests,discount_pct) VALUES (NULL,?,?)');
  insSlab.run(500, 3); insSlab.run(1000, 5); insSlab.run(2000, 8);

  // ── Contract-labor pool ──
  const insStaff = db.prepare('INSERT INTO staff (name,phone,whatsapp,role,day_rate) VALUES (?,?,?,?,?)');
  const STAFF = [
    ['Ramesh Jadhav', '9822000101', 'head_cook', 1500],
    ['Suresh Pawar', '9822000102', 'head_cook', 1500],
    ['Vitthal Shinde', '9822000103', 'cook', 1000],
    ['Ganesh More', '9822000104', 'cook', 1000],
    ['Santosh Kale', '9822000105', 'cook', 1000],
    ['Prakash Gaikwad', '9822000106', 'cook', 900],
    ['Anil Thorat', '9822000107', 'helper', 600],
    ['Baban Chavan', '9822000108', 'helper', 600],
    ['Sunil Deshmukh', '9822000109', 'helper', 600],
    ['Dattatray Salunkhe', '9822000110', 'helper', 550],
    ['Nitin Kamble', '9822000111', 'server', 500],
    ['Kishor Bhosale', '9822000112', 'server', 500],
    ['Vijay Sathe', '9822000113', 'server', 500],
    ['Ashok Wagh', '9822000114', 'driver', 700],
  ];
  for (const [name, ph, role, rate] of STAFF) insStaff.run(name, ph, ph, role, rate);

  // ── Vendors & venues ──
  const insVendor = db.prepare('INSERT INTO vendors (name,phone,category) VALUES (?,?,?)');
  insVendor.run('Shrirampur Kirana Bhandar', '9822000201', 'grocery');
  insVendor.run('Bajar Samiti Sabzi Vendor', '9822000202', 'vegetable');
  insVendor.run('Gokul Dairy', '9822000203', 'dairy');

  const insVenue = db.prepare('INSERT INTO venues (name,address,city,capacity) VALUES (?,?,?,?)');
  insVenue.run('Shrirampur Mangal Karyalay', 'Station Road', 'Shrirampur', 1500);
  insVenue.run('Sai Lawns', 'Newasa Road', 'Shrirampur', 3000);

  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('business_phone','9822000100')").run();
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('business_upi','shriramcaterers@upi')").run();

  console.log(`[seed] done: ${ING.length} ingredients, ${DISHES.length} dishes, 3 packages, ${STAFF.length} staff`);
  return true;
}

if (require.main === module) seed();
module.exports = { seed };
