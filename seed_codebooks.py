"""Seed detailed code book sections (depth=1) under existing chapter-level entries."""


def seed_detailed_sections(conn):
    books = conn.execute("SELECT id, code FROM code_books").fetchall()
    book_map = {row[1]: row[0] for row in books}

    for code, func in [
        ('IMC', _seed_imc), ('IFGC', _seed_ifgc), ('IECC', _seed_iecc),
        ('IBC', _seed_ibc), ('IRC', _seed_irc), ('IPC', _seed_ipc),
        ('NEC', _seed_nec), ('OSHA', _seed_osha),
    ]:
        bid = book_map.get(code)
        if bid:
            func(conn, bid)


def _ch(conn, book_id, num):
    row = conn.execute(
        "SELECT id FROM code_sections WHERE book_id=? AND section_number=? AND depth=0",
        (book_id, num)).fetchone()
    return row[0] if row else None


def _ins(conn, book_id, parent_id, sections):
    """Insert depth=1 sections if they don't exist, or update content if they do."""
    for i, (num, title, content) in enumerate(sections):
        exists = conn.execute(
            "SELECT id FROM code_sections WHERE book_id=? AND section_number=? AND depth=1",
            (book_id, num)).fetchone()
        if not exists:
            conn.execute(
                '''INSERT INTO code_sections
                       (book_id,section_number,title,content,parent_section_id,depth,sort_order)
                       VALUES (?,?,?,?,?,1,?)''',
                (book_id, num, title, content, parent_id, i))
        else:
            conn.execute(
                '''UPDATE code_sections SET content=?
                       WHERE book_id=? AND section_number=? AND depth=1''',
                (content, book_id, num))


def _update_content(conn, book_id, section_number, content):
    """Update a depth=0 chapter's content if it is currently empty."""
    conn.execute(
        '''UPDATE code_sections SET content=?
               WHERE book_id=? AND section_number=? AND depth=0
               AND (content IS NULL OR content='')''',
        (content, book_id, section_number))


# ── IMC (International Mechanical Code 2021) ─────────────────────

def _seed_imc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'Chapter 1 establishes the administrative framework for the International Mechanical Code, '
        'including scope, applicability, enforcement authority, permit requirements, and inspection '
        'procedures. It defines which buildings and systems fall under IMC jurisdiction versus IRC '
        'jurisdiction, and grants the code official broad authority to enforce compliance. HVAC '
        'contractors must obtain mechanical permits before beginning work and must schedule required '
        'inspections at rough-in, underground, and final stages.')
    _update_content(conn, bid, '2',
        'Chapter 2 provides definitions for terms used throughout the IMC. Precise definitions are '
        'critical for correct code interpretation, especially terms such as APPLIANCE, DUCT, PLENUM, '
        'MECHANICAL SYSTEM, REFRIGERANT, and VENTILATION. HVAC contractors should reference Chapter 2 '
        'whenever a code requirement uses a term that may have a technical meaning different from common '
        'usage. Defined terms are printed in italics throughout the code body.')
    _update_content(conn, bid, '3',
        'Chapter 3 covers general installation regulations applicable to all mechanical systems, '
        'including equipment listing and labeling requirements, structural protection, clearances to '
        'combustibles, equipment location restrictions, and access requirements for service and '
        'maintenance. Section 306 specifies minimum working space dimensions around equipment. '
        'Condensate disposal requirements in Section 307 are especially important for HVAC contractors '
        'installing cooling coils and heat pumps in Oklahoma\'s humid climate.')
    _update_content(conn, bid, '4',
        'Chapter 4 sets ventilation requirements for all occupied spaces, specifying minimum outdoor '
        'air quantities by occupancy type per Table 403.3.1.1. It covers both natural ventilation via '
        'operable openings and mechanical ventilation via supply and exhaust fans. Section 403 requires '
        'energy recovery ventilation in many climates. Oklahoma\'s Climate Zone 3A triggers specific '
        'economizer and ventilation rate requirements that HVAC designers must address in submittal '
        'documentation.')
    _update_content(conn, bid, '5',
        'Chapter 5 governs exhaust systems including clothes dryer exhaust, domestic and commercial '
        'kitchen exhaust, bathroom exhaust, and hazardous exhaust for laboratories and industrial '
        'spaces. Section 506 contains detailed requirements for Type I and Type II commercial kitchen '
        'hoods, which are complex systems requiring grease duct construction, fire suppression, and '
        'specific exhaust rates. Section 504 limits dryer exhaust duct length and requires booster '
        'fans when the run exceeds the maximum.')
    _update_content(conn, bid, '6',
        'Chapter 6 addresses duct systems including materials, construction standards, insulation, '
        'sealing, fire and smoke dampers, and air filtration. All duct systems must be constructed '
        'per SMACNA standards or equivalent. Section 603 specifies acceptable materials — sheet metal, '
        'flexible duct, and fibrous glass duct board each have size and location limitations. Section '
        '607 requires fire dampers at penetrations of fire-rated assemblies and smoke dampers at smoke '
        'barriers, critical for HVAC work in commercial buildings.')
    _update_content(conn, bid, '7',
        'Chapter 7 establishes combustion air requirements for fuel-burning appliances to ensure '
        'adequate oxygen for complete combustion and safe venting. The chapter provides two main '
        'methods: the indoor air method (requiring a minimum volume of 50 cubic feet per 1,000 Btu/hr '
        'of appliance input) and the outdoor air method (requiring openings sized per Tables 701.5.1 '
        'and 701.5.2). Direct-vent and fan-assisted appliances have separate provisions. HVAC '
        'contractors must calculate combustion air for every gas appliance installation.')
    _update_content(conn, bid, '8',
        'Chapter 8 covers chimneys, vents, and vent connectors for venting combustion products from '
        'fuel-burning appliances. It references NFPA 54 and manufacturer listing requirements for '
        'vent sizing. Section 803 specifies vent connector materials, slope (minimum 1/4 inch per '
        'foot rise), and maximum horizontal length. Section 804 covers vent sizing using Tables '
        '804.3.1 through 804.3.19 based on appliance Btu input, height, and lateral length. '
        'Orphaned water heaters after furnace replacement require re-venting analysis.')
    _update_content(conn, bid, '9',
        'Chapter 9 covers specific appliance installation requirements including floor furnaces, unit '
        'heaters, vented wall furnaces, duct furnaces, heat pumps, infrared heaters, and solid '
        'fuel-burning equipment. Each appliance type has clearance, support, access, and venting '
        'requirements specific to that equipment. Section 906 addresses heat pumps including '
        'refrigerant line requirements, defrost controls, and auxiliary heat lockout temperature '
        'settings.')
    _update_content(conn, bid, '10',
        'Chapter 10 regulates boilers, water heaters, and pressure vessels including installation, '
        'safety controls, pressure relief valves, and required clearances. Section 1003 requires '
        'boilers to be listed and have automatic safety controls including low-water cutoffs, '
        'pressure relief valves discharging per Section 1006, and operating controls. Section 1006 '
        'specifies that relief valve discharge piping must terminate within 6 inches of the floor '
        'or connect to a floor drain without valves in the discharge line.')
    _update_content(conn, bid, '11',
        'Chapter 11 governs refrigeration systems including refrigerant types, quantity limits, '
        'machinery room requirements, leak detection, pressure testing, and safety relief. Section '
        '1103 limits refrigerant quantities in occupied spaces based on the refrigerant\'s '
        'classification (A1 through B3) per ASHRAE 34. Systems exceeding quantity limits require '
        'a dedicated machinery room with ventilation, gas detection, and emergency shutoffs per '
        'Section 1105. Most common HVAC refrigerants (R-410A, R-32, R-454B) are A1 classification.')
    _update_content(conn, bid, '12',
        'Chapter 12 addresses hydronic piping systems for heating and cooling including materials, '
        'joints, supports, expansion tanks, air elimination, and testing. Section 1202 lists '
        'approved pipe materials: steel, copper, CPVC, PEX, and PEX-AL-PEX with applicable ASTM '
        'standards. All hydronic systems must be tested at 1.5 times working pressure minimum '
        'per Section 1205. Expansion tanks must be sized to accommodate system fluid volume change '
        'from cold fill to maximum operating temperature.')
    _update_content(conn, bid, '13',
        'Chapter 13 covers fuel oil piping and storage systems for oil-fired heating equipment. '
        'Section 1302 lists approved materials for fuel oil piping. Section 1305 addresses oil '
        'storage tanks including capacity limits, fill and vent connections, and overfill '
        'protection. Above-ground tanks over 60 gallons require secondary containment. Fuel oil '
        'systems are less common in Oklahoma but apply to backup generator fuel systems and '
        'older commercial boiler installations.')
    _update_content(conn, bid, '14',
        'Chapter 14 covers solar thermal energy systems including collectors, heat exchangers, '
        'storage tanks, controls, and freeze protection. Section 1402 requires solar thermal '
        'systems to be installed per listing and manufacturer instructions. Heat transfer fluids '
        'must be non-toxic where installed in potable water systems per Section 1403. Solar '
        'thermal systems for commercial buildings can contribute to IECC energy compliance '
        'credits and LEED points.')
    _update_content(conn, bid, '15',
        'Chapter 15 lists all standards referenced throughout the IMC including ASHRAE, ACCA, '
        'AMCA, SMACNA, NFPA, and AHRI standards. Referenced standards are enforceable as part '
        'of the code. Key references include ASHRAE 62.1 for ventilation, SMACNA HVAC Duct '
        'Construction Standards for duct fabrication, ACCA Manual D for duct design, ACCA '
        'Manual J for load calculations, and AHRI standards for equipment rating and testing.')

    # ── Depth=1 sections ──────────────────────────────────────────
    # Ch 1 - Scope and Administration
    _ins(conn, bid, _ch(conn, bid, '1'), [
        ('101', 'General',
         'Section 101 establishes the scope of the IMC covering design, installation, maintenance, '
         'alteration, and inspection of mechanical systems in new and existing structures. The code '
         'applies to all buildings except detached one- and two-family dwellings and townhouses three '
         'stories or less, which are regulated by the IRC. Section 101.2 clarifies that installations '
         'made under prior codes may remain in service if they do not constitute a distinct hazard to '
         'life or property. HVAC contractors working on mixed-use or multi-family projects must '
         'determine whether IMC or IRC governs before submitting permit applications.'),
        ('102', 'Applicability',
         'Section 102 addresses existing mechanical systems: legally installed systems may remain '
         'provided they are maintained in safe operating condition. When systems are relocated, '
         'replaced, or when new additions are made, the new work must fully comply with current '
         'IMC requirements. Section 102.3 states that equipment added to an existing system must '
         'not make the existing system less compliant. Moved buildings must meet all requirements '
         'for new construction. This is important when retrofitting existing commercial HVAC '
         'systems — partial replacements must not compromise existing compliant elements.'),
        ('103', 'Department of Mechanical Inspection',
         'Section 103 establishes the Department of Mechanical Inspection and the authority of the '
         'code official to enforce all provisions of the IMC. The code official may approve '
         'alternative materials, equipment, and methods of construction that meet the intent of the '
         'code per Section 104.11. Section 103.3 allows the code official to enter any building '
         'or premises to perform inspections during reasonable hours. HVAC contractors should '
         'maintain open communication with the AHJ and document all approved deviations from '
         'standard code in writing.'),
        ('104', 'Duties and Powers',
         'Section 104 enumerates the duties and powers of the code official including the right to '
         'inspect, issue permits, approve plans, and require testing of systems. The code official '
         'may issue notices of violation and stop-work orders and may require the removal of '
         'unlawful work. Section 104.8 limits the personal liability of the code official acting '
         'in good faith. Section 104.11 permits approval of alternative materials or methods when '
         'the applicant demonstrates equivalence through testing data, engineering analysis, or '
         'comparative research reports.'),
        ('106', 'Permits',
         'Section 106 requires mechanical permits before installation, alteration, extension, or '
         'replacement of mechanical systems. Exempted work includes portable heating/cooling '
         'appliances, replacement of identical components (motors, controls) that do not change '
         'capacity or fuel type, and listed self-contained refrigeration systems under 10 lb '
         'refrigerant. Section 106.3 requires construction documents with equipment schedules, '
         'duct layouts, and load calculations for permit submission. Contractors must retain '
         'permits on site and make them available for inspection.'),
        ('107', 'Inspections and Testing',
         'Section 107 establishes required inspection stages: underground rough-in before '
         'backfill, above-ground rough-in before concealment, and final inspection when work is '
         'complete. Section 107.2 requires mechanical systems to be tested before final approval — '
         'duct systems must be capable of withstanding test pressures per Section 603. Systems '
         'must not be concealed, covered, or put into service before approval. Section 107.5 '
         'addresses reinspection fees when work is not ready or corrections are not made between '
         'inspection calls.'),
    ])
    # Ch 2 - Definitions
    _ins(conn, bid, _ch(conn, bid, '2'), [
        ('201', 'General',
         'Section 201 states that terms defined in Chapter 2 apply throughout the IMC and take '
         'precedence over common dictionary definitions. Terms not defined in Chapter 2 but defined '
         'in referenced standards carry those standard definitions. Section 201.1 notes that where '
         'terms appear in italics in the code text, they are defined terms. Understanding precise '
         'definitions is critical for correct code interpretation — for example, PLENUM has a '
         'specific meaning that affects duct material requirements under Section 602.'),
        ('202', 'General Definitions',
         'Key definitions for HVAC work include: APPLIANCE (a device that uses fuel or other '
         'energy to produce heat, light, power, or similar results); DUCT (an enclosed conduit '
         'for conveying air); MECHANICAL SYSTEM (heating, ventilating, air conditioning, '
         'refrigeration, piping and similar systems); PLENUM (an air compartment forming part of '
         'the air distribution system); REFRIGERANT (the fluid used in a refrigerating system); '
         'VENTILATION (supply of outdoor air to a space by natural or mechanical means). HVAC '
         'contractors should be familiar with all definitions before interpreting any code section.'),
    ])
    # Ch 3 - General Regulations
    _ins(conn, bid, _ch(conn, bid, '3'), [
        ('301', 'General',
         'Section 301 requires all mechanical systems and equipment to be installed in accordance '
         'with manufacturer instructions and the IMC. Equipment must be listed and labeled by an '
         'approved third-party testing agency (UL, ETL, CSA) per Section 301.3. Unlisted equipment '
         'requires specific code official approval. Section 301.6 prohibits the use of used or '
         'reconditioned equipment unless it is demonstrated to be safe and in compliance with '
         'current code requirements.'),
        ('302', 'Protection of Structure',
         'Section 302 requires that mechanical system installations not reduce the load-bearing '
         'capacity or fire-resistance rating of structural elements. Penetrations through fire-rated '
         'assemblies must be protected with approved firestopping systems per Section 302.2, '
         'referencing IBC Chapter 7 requirements. Duct and pipe penetrations through rated '
         'assemblies must be sleeved and sealed with tested firestop systems. Structural members '
         'must not be cut or notched beyond limits established by the structural engineer.'),
        ('303', 'Equipment and Appliance Location',
         'Section 303 restricts installation of fuel-burning equipment in certain locations. '
         'Section 303.3 prohibits fuel-burning appliances in sleeping rooms, bathrooms, and '
         'closets unless the appliances are direct-vent type or listed specifically for such '
         'installation. Appliances in garages and carports must be elevated so the pilot or '
         'burner ignition device is at least 18 inches above the floor per Section 303.3.1. '
         'Outdoor mechanical equipment must be weatherproofed per manufacturer requirements '
         'and protected from vehicle impact where applicable.'),
        ('304', 'Installation',
         'Section 304 requires equipment to be installed level and plumb per manufacturer '
         'specifications and properly anchored against movement. Vibration isolation is required '
         'where equipment vibration could be transmitted to the building structure per Section '
         '304.4. All equipment must be accessible for inspection, service, repair, and '
         'replacement of any component without disassembling other parts of the building per '
         'Section 306. Section 304.2 addresses seismic bracing requirements per IBC Chapter 16 '
         'in applicable seismic design categories.'),
        ('305', 'Piping Support',
         'Section 305 requires piping to be supported at maximum intervals per Table 305.4, '
         'which varies by pipe material and diameter (for example, 1-inch steel pipe requires '
         'supports every 12 feet; 1-inch copper every 6 feet). Hangers, anchors, and supports '
         'must be rated for the pipe weight in operating condition including fluid and insulation. '
         'Piping must be protected from corrosion where in contact with dissimilar metals or '
         'corrosive materials. Section 305.6 requires pipe penetrations through walls, floors, '
         'and roofs to be sleeved and sealed.'),
        ('306', 'Access and Service Space',
         'Section 306 mandates that all equipment be accessible without removing permanent '
         'construction. A minimum clear working space of 30 inches must be provided in front '
         'of the service side of any appliance or equipment. Attic-mounted equipment requires '
         'a passageway at least 22 inches wide and 30 inches high from the attic access to the '
         'equipment, plus a level service platform 30 inches by 30 inches at the equipment '
         'per Section 306.3. Crawl space installations require a 24-inch clearance to the '
         'bottom of the equipment.'),
        ('307', 'Condensate Disposal',
         'Section 307 requires all equipment that produces condensate to drain the condensate '
         'through indirect waste piping to an approved location. Primary drain pans must be '
         'provided under all evaporator coils and air handlers, and a secondary overflow drain '
         'or secondary drain pan with water alarm sensor is required where condensate overflow '
         'could cause property damage per Section 307.2.3. Section 307.2.4 specifies condensate '
         'drain line sizing (minimum 3/4-inch PVC), minimum slope of 1/8 inch per foot, and '
         'trap requirements for negative-pressure drain pans.'),
        ('308', 'Clearances to Combustibles',
         'Section 308 requires equipment clearances from combustible materials per the listing '
         'and manufacturer installation instructions — listed clearances are the minimum and '
         'cannot be reduced without specific listed reduced-clearance means. Section 308.3 '
         'specifies that when clearances are reduced using approved shields or insulating '
         'materials, the method must be listed for that purpose. HVAC contractors must verify '
         'clearances in tight mechanical rooms and attic installations before finalizing '
         'equipment locations.'),
    ])
    # Ch 4 - Ventilation
    _ins(conn, bid, _ch(conn, bid, '4'), [
        ('401', 'General',
         'Section 401 establishes the scope of Chapter 4 ventilation requirements. All occupied '
         'spaces must be ventilated by natural means per Section 402 or mechanical means per '
         'Section 403. Ventilation rates must comply with Table 403.3.1.1, which specifies outdoor '
         'air requirements by occupancy type — for example, offices require 5 CFM/person plus '
         '0.06 CFM/sq ft. The code official may require documentation of ventilation design '
         'calculations. Recirculated air must be filtered per Section 401.3 with a minimum '
         'MERV 8 filter for most occupancies.'),
        ('402', 'Natural Ventilation',
         'Section 402 allows natural ventilation through operable exterior openings with a net '
         'free area of at least 4% of the floor area of the space being ventilated. All openings '
         'must open to the outdoors and must be protected against weather. Natural ventilation '
         'is not permitted for hazardous occupancies or spaces requiring close temperature or '
         'humidity control. Section 402.3 restricts natural ventilation openings from being '
         'located where contaminants from adjacent operations could be drawn in.'),
        ('403', 'Mechanical Ventilation',
         'Section 403 requires mechanical ventilation systems to provide outdoor air at rates '
         'specified in Table 403.3.1.1 based on occupancy category and floor area. Section '
         '403.2 requires ventilation systems to include controls for balancing and adjusting '
         'airflow. Energy recovery ventilation systems (ERV/HRV) are required in Climate Zone '
         '3 when exhaust airflow exceeds 70% of the supply airflow per Section 403.3.5. '
         'Demand-controlled ventilation (DCV) using CO2 sensors is permitted as an alternative '
         'to fixed minimum outdoor air rates per Section 403.3.4.'),
        ('404', 'Enclosed Parking Garages',
         'Section 404 requires mechanical ventilation in enclosed parking garages capable of '
         'exhausting a minimum 0.75 CFM per square foot of floor area. Carbon monoxide detection '
         'systems may be used to modulate ventilation rates per Section 404.1 Exception 1, '
         'reducing fan operation when CO levels are below 25 ppm and providing full ventilation '
         'when CO exceeds 50 ppm. Fans must operate continuously or through automatic controls '
         'that detect vehicle entry. Exhaust outlets must be located to prevent recirculation '
         'of exhaust gases into occupied areas of the building.'),
        ('405', 'Systems Control',
         'Section 405 requires ventilation systems to include controls for automatic operation '
         'and to allow manual override. Fans serving multiple zones must be capable of '
         'independently adjusting airflow per zone. Section 405.2 requires interlocks between '
         'HVAC equipment and exhaust fans to prevent negative building pressure. Energy '
         'management and control systems (EMCS) may be used to optimize ventilation per '
         'demand, provided the system maintains minimum outdoor air rates at all times '
         'during occupied hours.'),
    ])
    # Ch 5 - Exhaust Systems
    _ins(conn, bid, _ch(conn, bid, '5'), [
        ('501', 'General',
         'Section 501 establishes the scope of exhaust system requirements, covering all '
         'systems designed to remove air, vapors, or contaminants from occupied and '
         'non-occupied spaces. Exhaust systems must not recirculate air from areas with '
         'hazardous contaminants per Section 501.3. Exhaust air must be discharged to the '
         'outdoors and not into attic spaces, crawl spaces, or wall cavities. Exhaust '
         'openings must be located to prevent re-entrainment of exhausted air back into '
         'the building through intake openings — minimum separation varies by application.'),
        ('502', 'Required Systems',
         'Section 502 mandates exhaust ventilation for specific spaces including bathrooms, '
         'locker rooms, laundries, garages, and laboratories. Bathrooms must have exhaust '
         'at 50 CFM intermittent or 20 CFM continuous per Section 502.2.1. Commercial '
         'kitchens with cooking equipment must have Type I or Type II exhaust hoods per '
         'Section 506. Section 502.12 requires exhaust for spray booths, painting operations, '
         'and other hazardous processes. All required exhaust systems must operate at design '
         'capacity whenever the served space is occupied.'),
        ('503', 'Motors, Fans and Filters',
         'Section 503 requires exhaust fans and motors to be listed and rated for the '
         'service. Fans must be selected for the static pressure requirements of the system '
         'at design airflow. Belt-drive fans must have adjustable sheaves for balancing. '
         'Fans handling grease-laden vapors must be listed for that service and constructed '
         'of steel or aluminum with UL 762 listing. Filters in exhaust systems must be '
         'rated for the temperature of the airstream and accessible for maintenance per '
         'Section 605.'),
        ('504', 'Clothes Dryer Exhaust',
         'Section 504 limits clothes dryer exhaust duct length to 35 feet from the dryer '
         'to the exterior termination, reduced by 2.5 feet for each 90-degree elbow and '
         '1.25 feet for each 45-degree elbow. When the duct length would exceed the limit, '
         'a listed booster fan must be installed. Dryer exhaust must terminate outdoors '
         'through a backdraft damper, never into attics, crawl spaces, or wall cavities. '
         'Commercial dryer exhaust must comply with the dryer manufacturer\'s specifications '
         'and is exempt from residential duct length limits per Section 504.2.'),
        ('505', 'Domestic Kitchen Exhaust',
         'Section 505 allows domestic kitchen exhaust hoods to recirculate air when '
         'equipped with activated carbon filters, but requires at a minimum 100 CFM for '
         'intermittent operation or 25 CFM continuous per Section 505.1. Duct-free hoods '
         'are permitted for residential kitchens per the exception, provided they include '
         'a charcoal filter to reduce odors. Range hoods must discharge through smooth '
         'metal duct (not flexible) at minimum 3-1/4 by 10 inch rectangular or 6-inch '
         'round duct size.'),
        ('506', 'Commercial Kitchen Hoods',
         'Section 506 contains extensive requirements for commercial kitchen ventilation. '
         'Type I hoods are required over equipment that produces grease-laden vapors '
         '(fryers, griddles, ranges) and must include a grease filter, grease collection '
         'trough, and fire suppression system per Section 506.3. Type II hoods serve '
         'equipment producing only heat, steam, or odors without grease. Exhaust rates '
         'are determined from Table 506.3.3 based on hood style, duty level, and '
         'equipment type. HVAC contractors must coordinate hood sizing with equipment '
         'schedules and fire suppression contractors.'),
        ('510', 'Hazardous Exhaust Systems',
         'Section 510 governs exhaust systems for laboratories, chemical storage rooms, '
         'spray booths, and other areas handling hazardous materials. Duct materials must '
         'be selected for compatibility with the contaminants being exhausted — corrosive '
         'exhaust may require stainless steel, FRP, or PVC duct. Hazardous exhaust systems '
         'must operate continuously during occupied hours and include alarm systems for '
         'fan failure. Section 510.6 requires duct velocity of at least 2,000 FPM for '
         'systems conveying particulates to prevent settling and accumulation.'),
    ])
    # Ch 6 - Duct Systems
    _ins(conn, bid, _ch(conn, bid, '6'), [
        ('601', 'General',
         'Section 601 establishes that duct systems must be installed per Chapter 6 and '
         'constructed per SMACNA HVAC Duct Construction Standards or equivalent. All ducts '
         'must be designed to deliver design airflow without excessive pressure drop. Section '
         '601.2 requires ducts to be constructed of approved materials and prohibits the use '
         'of building cavities (stud bays, joist spaces) as supply or return plenums except '
         'as specifically permitted by Section 602.'),
        ('602', 'Plenums',
         'Section 602 regulates the use of building spaces as plenums for air distribution. '
         'Return air plenums may use structural spaces (above suspended ceilings, raised '
         'floors) only if the materials within the plenum space have a flame spread index '
         'of 25 or less and a smoke developed index of 50 or less per Section 602.2. '
         'Piping conveying flammable or combustible liquids, or gas piping, is prohibited '
         'in supply plenums. Electrical wiring in plenums must be plenum-rated per NEC '
         'Section 300.22.'),
        ('603', 'Duct Construction and Materials',
         'Section 603 specifies approved duct materials including galvanized steel (ASTM '
         'A653), aluminum, stainless steel, and nonmetallic materials such as flexible '
         'duct and fibrous glass duct board. Flexible duct must be UL 181 listed and '
         'limited to 5 feet in length per connection. Sheet metal duct must be constructed '
         'per SMACNA gauge tables. Section 603.9 prohibits flexible duct runs that are '
         'compressed or kinked, which significantly increases resistance and reduces '
         'airflow. Duct joints must be mechanically fastened and sealed.'),
        ('604', 'Duct Insulation',
         'Section 604 requires supply ducts in unconditioned spaces to be insulated to a '
         'minimum of R-6 and return ducts to R-3.5 per Table 604.1 (commercial) and '
         'IECC Table R403.3.1 (residential). Ducts within conditioned space may be '
         'uninsulated per the exceptions. Insulation must be installed without gaps, '
         'compressions, or voids and must be vapor-retarder faced in climates where '
         'condensation on cold surfaces is a concern. Oklahoma\'s humid summer climate '
         'requires careful attention to insulation and vapor retarder continuity on '
         'cold duct surfaces.'),
        ('605', 'Air Filters',
         'Section 605 requires air distribution systems to include filters listed in '
         'accordance with UL 900 or ASHRAE 52.2. Minimum filter efficiency is MERV 8 '
         'for most commercial systems per ASHRAE 62.1 Table 6-4. Filters must be '
         'accessible for replacement without disassembling ductwork. Section 605.2 '
         'requires filter housings to be airtight to prevent bypass. High-efficiency '
         'filters (MERV 13+) require system static pressure verification to ensure '
         'the air handler fan can maintain design airflow against the higher filter '
         'resistance.'),
        ('606', 'Smoke Detection',
         'Section 606 requires smoke detectors in air distribution systems serving '
         'areas over 2,000 sq ft or systems with design capacity exceeding 2,000 CFM. '
         'Duct smoke detectors must shut down the air handling system upon detection '
         'and are required in both supply and return ducts per Section 606.2. Duct '
         'smoke detectors are NOT a substitute for area smoke detectors required by '
         'NFPA 72. Section 606.4 requires the detectors to be listed per UL 268A '
         'and accessible for testing and maintenance without disassembling the duct.'),
        ('607', 'Fire and Smoke Dampers',
         'Section 607 requires fire dampers at all duct penetrations through '
         'fire-resistance-rated walls, partitions, and floor assemblies. Smoke dampers '
         'are required at penetrations through smoke barriers and smoke partitions. '
         'Combination fire/smoke dampers may serve both functions. Section 607.5 '
         'specifies access requirements — each damper must have an access door at '
         'least 12 x 12 inches located within 18 inches of the damper. Dampers must '
         'be tested per NFPA 80 and NFPA 105 and inspected annually. Missing or '
         'improperly installed dampers are a leading cause of fire and life-safety '
         'deficiencies found during inspections.'),
    ])
    # Ch 7 - Combustion Air
    _ins(conn, bid, _ch(conn, bid, '7'), [
        ('701', 'General',
         'Section 701 establishes requirements for combustion air supply to all '
         'fuel-burning appliances. Adequate combustion air is essential for complete '
         'combustion, proper venting, and prevention of carbon monoxide production. '
         'Appliances certified as direct-vent or engineered with sealed combustion '
         'draw combustion air from outdoors and are exempt from many indoor air '
         'requirements. The code official may require calculations demonstrating '
         'adequate combustion air volume for any installation.'),
        ('702', 'Inside Air',
         'Section 702 permits combustion air to be drawn from inside the building '
         'when the total volume of the space is at least 50 cubic feet per 1,000 '
         'Btu/hr of all appliance inputs in that space. If the space is confined '
         '(less than required volume), combustion air must be supplied from adjacent '
         'indoor spaces through openings with a total free area of at least 1 sq inch '
         'per 1,000 Btu/hr. Modern tight construction often makes the indoor air '
         'method impractical, requiring outdoor air supply.'),
        ('703', 'Outdoor Air',
         'Section 703 specifies two outdoor combustion air opening configurations: '
         'two-opening method (one within 12 inches of the top, one within 12 inches '
         'of the bottom of the appliance enclosure, each sized at 1 sq inch per '
         '4,000 Btu/hr for horizontal ducts and 1 sq inch per 2,000 Btu/hr for '
         'vertical) and single-opening method. Direct openings to outdoors require '
         'screens with openings no smaller than 1/4 inch. Duct-supplied outdoor '
         'combustion air must have a cross-sectional area equal to the required '
         'opening area.'),
        ('704', 'Combined Use',
         'Section 704 permits combustion air to be drawn from a combination of '
         'indoor and outdoor sources when neither indoor volume alone nor outdoor '
         'openings alone satisfy requirements. Engineering calculations must demonstrate '
         'that total combustion air quantity is adequate under worst-case conditions '
         'including all exhaust fans operating simultaneously. HVAC contractors must '
         'account for kitchen exhaust hoods, dryer exhaust, and bathroom fans when '
         'calculating available indoor combustion air in residential applications.'),
    ])
    # Ch 8 - Chimneys and Vents
    _ins(conn, bid, _ch(conn, bid, '8'), [
        ('801', 'General',
         'Section 801 establishes that all fuel-burning appliances must be vented to '
         'the outdoors per Chapter 8 unless specifically listed as unvented. Vent '
         'systems must be designed and installed per the appliance listing and '
         'manufacturer instructions. Section 801.2 prohibits venting into attics, '
         'crawl spaces, or concealed spaces. Connectors must slope upward from the '
         'appliance to the chimney or vent at a minimum of 1/4 inch per foot rise.'),
        ('802', 'Vent Components',
         'Section 802 defines vent categories (I through IV) based on appliance flue '
         'gas temperature and pressure. Category I vents (most common — negative '
         'pressure, non-condensing) use Type B or Type L vent material. Category II '
         'and IV (condensing, positive pressure) require listed special vent systems '
         'with corrosion-resistant materials. PVC and CPVC venting are used for '
         '90%+ AFUE condensing furnaces and must be listed per UL 1738. Section '
         '802.4 lists approved materials for each vent category.'),
        ('803', 'Chimney and Vent Connectors',
         'Section 803 covers the connector pipe from the appliance draft hood or '
         'flue collar to the chimney or vent. Connectors must be single-wall metal '
         'at minimum (26-gauge galvanized for Category I) or may be double-wall '
         'Type B vent. Maximum horizontal connector length is 75% of the height '
         'of the vent above the connector per Section 803.2.4. Connectors may not '
         'extend through any floor or concealed space. Section 803.5 requires '
         'cleanout tees or caps at changes of direction.'),
        ('804', 'Venting Systems',
         'Section 804 provides sizing methodology for vent systems using Tables '
         '804.3.1 through 804.3.19 in the IMC. Vent sizing is based on appliance '
         'Btu/hr input rating, total vent height, and lateral length. Common-vent '
         'systems serving multiple appliances require capacity analysis per Section '
         '804.3.4. When an appliance is replaced and the existing vent is reused, '
         'its capacity must be verified for the new appliance. Orphaned water heaters '
         '(when a furnace sharing a common vent is removed) must be re-vented.'),
        ('805', 'Factory-Built Chimneys',
         'Section 805 governs factory-built (pre-engineered) chimneys that are '
         'listed per UL 103 for general use or UL 103HT for high-temperature '
         'applications. Factory-built chimneys must be installed per their listing '
         'and may not be mixed with components from other manufacturers. Section '
         '805.4 specifies clearances from combustibles per the listing, typically '
         '2 inches for most all-fuel chimneys. Support and termination requirements '
         'must follow manufacturer instructions. Termination must extend at least '
         '3 feet above the roof penetration point and 2 feet above any structure '
         'within 10 feet horizontally.'),
    ])
    # Ch 9 - Specific Appliances
    _ins(conn, bid, _ch(conn, bid, '9'), [
        ('901', 'General',
         'Section 901 establishes that all appliances covered in Chapter 9 must be '
         'listed and labeled by an approved testing agency and installed per their '
         'listing and manufacturer instructions. Chapter 9 covers a wide variety of '
         'heating and cooling appliances not addressed in other chapters. Section '
         '901.2 requires appliances to be installed on level surfaces capable of '
         'supporting the equipment weight. Access per Section 306 must be provided '
         'to all appliances for service and maintenance.'),
        ('902', 'Floor Furnaces',
         'Section 902 covers floor furnaces installed below and flush with the '
         'floor. Section 902.5 requires a 6-inch clearance to walls and registers '
         'at least 6 inches from any combustible material. Floor furnaces are '
         'prohibited in mobile homes and manufactured housing. A shutoff valve '
         'within 6 feet of the furnace is required. Floor registers must be '
         'protected against ignition of floor coverings.'),
        ('903', 'Unit Heaters',
         'Section 903 addresses unit heaters — suspended, floor, or wall-mounted '
         'gas-fired heaters used in garages, warehouses, and industrial spaces. '
         'Gas-fired unit heaters must be vented per Chapter 8 unless the space is '
         'large enough to safely dilute combustion products. Section 903.4 specifies '
         'clearances from combustibles per listing. Propeller-type fans in unit '
         'heaters must discharge toward the open area of the space and away from '
         'walls and obstructions.'),
        ('904', 'Vented Wall Furnaces',
         'Section 904 governs vented wall furnaces recessed into or mounted on '
         'walls. Section 904.3 requires a 12-inch clearance from corners. Wall '
         'furnaces must be vented through the wall into a listed venting system. '
         'Section 904.5 prohibits wall furnaces in bathrooms and bedrooms unless '
         'specifically listed for those locations. Access to the burner and controls '
         'must be provided without removing the wall assembly.'),
        ('906', 'Heat Pumps',
         'Section 906 covers air-source and ground-source heat pumps. Refrigerant '
         'line sets must be sized per the equipment manufacturer and insulated to '
         'prevent condensation. Section 906.3 requires heat pumps to include '
         'defrost controls that prevent excessive ice buildup on outdoor coils. '
         'Auxiliary electric resistance heat must be interlocked to operate only '
         'when the heat pump is operating or when outdoor temperature drops below '
         'the heat pump\'s balance point. Refrigerant must be recovered and recycled '
         'per EPA Section 608 regulations during any service or decommissioning.'),
    ])
    # Ch 10 - Boilers, Water Heaters, Pressure Vessels
    _ins(conn, bid, _ch(conn, bid, '10'), [
        ('1001', 'General',
         'Section 1001 establishes that boilers, water heaters, and pressure vessels '
         'must be listed and labeled per ASME Boiler and Pressure Vessel Code. '
         'Section 1001.2 requires equipment to be installed per listing and '
         'manufacturer instructions. All pressure-retaining components must meet '
         'applicable ASME sections — Section I for power boilers, Section IV for '
         'heating boilers, and Section VIII for pressure vessels.'),
        ('1002', 'Water Heaters',
         'Section 1002 applies to water heaters installed for domestic hot water '
         'supply. Temperature and pressure (T&P) relief valves must be installed '
         'on all water heaters per Section 1002.2. The relief valve must be set '
         'to open at no more than 210°F and 150 psi. Discharge piping from T&P '
         'relief valves must be full-size (matching valve outlet), pitched to drain, '
         'and terminate within 6 inches of the floor or into a floor drain per '
         'Section 1006.2. Expansion tanks are required on closed water heater systems.'),
        ('1003', 'Boilers',
         'Section 1003 requires boilers to be equipped with automatic safety controls '
         'including operating controls, high-limit controls, low-water cutoffs (steam '
         'and hot water above 400 MBH), and pressure relief valves. Section 1003.3 '
         'requires boilers to be vented per Chapter 8. Boilers in residential '
         'applications under 200,000 Btu/hr input are typically regulated more '
         'leniently; commercial and industrial boilers require full ASME code '
         'compliance and may require state boiler inspection.'),
        ('1004', 'Pressure Vessels',
         'Section 1004 covers pressure vessels used in HVAC applications including '
         'expansion tanks, air separators, and storage tanks. Pressure vessels must '
         'be constructed per ASME Section VIII Division 1 and bear the ASME "U" '
         'stamp for vessels exceeding code thresholds. Expansion tanks in hydronic '
         'systems must be sized to accommodate the total fluid volume change from '
         'cold fill temperature to maximum operating temperature, and must include '
         'an adequate air charge or diaphragm to prevent waterlogging.'),
        ('1006', 'Safety and Pressure Relief',
         'Section 1006 specifies requirements for pressure relief valves on all '
         'boilers and pressure vessels. Relief valves must be set at or below the '
         'maximum allowable working pressure (MAWP) of the vessel. Discharge '
         'piping must be at least the same size as the valve outlet, pitched '
         'downward to drain, and must not have any valve, restriction, or '
         'elbow that could prevent full flow. Section 1006.5 prohibits using '
         'relief valve discharge piping as a drain for any other purpose.'),
    ])
    # Ch 11 - Refrigeration
    _ins(conn, bid, _ch(conn, bid, '11'), [
        ('1101', 'General',
         'Section 1101 establishes that refrigeration systems must comply with '
         'Chapter 11 and with ASHRAE 15 (Safety Standard for Refrigeration Systems). '
         'Equipment must be listed and installed per listing requirements. Section '
         '1101.3 requires refrigerant to be recovered, recycled, and handled per '
         'EPA 40 CFR Part 82 (Section 608 regulations). HVAC technicians must hold '
         'EPA Section 608 certification to purchase and handle refrigerants. Systems '
         'must be pressure-tested per Section 1101.7 before being charged with '
         'refrigerant.'),
        ('1102', 'System Requirements',
         'Section 1102 specifies design requirements for refrigeration systems '
         'including pressure classification, materials of construction, and safety '
         'controls. Systems must include high-pressure and low-pressure cutouts, '
         'pressure relief valves on high-side components, and low ambient controls '
         'where applicable. Section 1102.2 requires refrigerant receiver liquid '
         'lines to have shutoff valves. Leak detection equipment is required in '
         'machinery rooms per Section 1105.4.'),
        ('1103', 'Refrigerant Quantity Limits',
         'Section 1103 establishes maximum refrigerant quantities allowed in '
         'occupied spaces based on the refrigerant\'s ASHRAE 34 safety classification. '
         'A1 refrigerants (R-410A, R-32, R-454B, R-22) have higher allowable '
         'quantities than A2L, A2, or B-class refrigerants. When quantities exceed '
         'Table 1103.1 limits for the occupancy, a machinery room is required per '
         'Section 1105. Contractors must calculate total system charge and compare '
         'to occupancy-based limits for all installations.'),
        ('1104', 'Piping',
         'Section 1104 covers refrigerant piping materials, joints, insulation, '
         'and pressure ratings. Copper tubing per ASTM B280 (ACR tubing) is the '
         'standard material for most HVAC refrigerant systems. Section 1104.2 '
         'requires joints to be brazed (silver solder) for refrigerant piping — '
         'soft solder is not permitted. Suction lines must be insulated to prevent '
         'condensation and maintain system efficiency. Liquid lines require '
         'insulation in hot outdoor locations to prevent flash gas. Pipe must be '
         'supported per Table 1104.4.'),
        ('1105', 'Machinery Rooms',
         'Section 1105 requires a dedicated machinery room when refrigerant quantities '
         'exceed the limits in Table 1103.1. Machinery rooms must have tight-fitting '
         'doors opening outward, continuous ventilation at 0.5 CFM per sq ft minimum, '
         'refrigerant detector at floor or ceiling level depending on refrigerant '
         'density, and emergency shutoff controls outside the room per Section 1105.4. '
         'All electrical equipment inside machinery rooms must be rated for classified '
         'locations where flammable refrigerants (A2, A2L, B2L, A3) are used.'),
    ])
    # Ch 12 - Hydronic Piping
    _ins(conn, bid, _ch(conn, bid, '12'), [
        ('1201', 'General',
         'Section 1201 establishes requirements for hydronic heating and cooling piping '
         'systems carrying water, antifreeze, or other heat transfer fluids. Systems '
         'must be designed and installed to prevent thermal stress, water hammer, and '
         'corrosion. Section 1201.2 requires hydronic systems to include provisions '
         'for system flushing and chemical treatment access. Glycol-based antifreeze '
         'systems require inhibited food-grade glycol where connections exist to '
         'potable water systems.'),
        ('1202', 'Material',
         'Section 1202 lists approved materials for hydronic piping: black steel '
         '(ASTM A53), copper (ASTM B88), CPVC (ASTM F441), PEX (ASTM F876/F877), '
         'PEX-AL-PEX, and polypropylene (ASTM F2389). Material selection must '
         'account for system operating temperature and pressure. Black steel is '
         'standard for commercial hot water heating. Copper is common for smaller '
         'residential hydronic systems. PEX is widely used for radiant floor heating '
         'systems operating below 180°F.'),
        ('1203', 'Joints and Connections',
         'Section 1203 requires pipe joints to be appropriate for the material and '
         'system conditions. Steel pipe uses threaded, grooved-mechanical, or welded '
         'joints. Copper uses soldered (95/5 tin-antimony for systems above 180°F) '
         'or brazed joints. Press-connect fittings are permitted per Section 1203.5 '
         'with listed fittings for each pipe material. PEX connections use '
         'insert-and-crimp, clamp, or expansion fittings per the listing. No solder '
         'containing lead is permitted in hydronic systems connected to domestic '
         'water.'),
        ('1204', 'Piping Installation',
         'Section 1204 requires hydronic piping to be supported per Table 305.4, '
         'slope to drain (1 inch per 10 feet minimum) to allow complete system '
         'draining, and include isolation valves at each major component for service. '
         'Air elimination devices must be installed at high points in the system. '
         'Balancing valves or circuit setters are required at each terminal unit '
         'to allow system balancing. Dielectric unions are required between '
         'dissimilar metals (steel to copper) to prevent galvanic corrosion.'),
        ('1205', 'Tests',
         'Section 1205 requires hydronic piping to be hydrostatically tested at '
         '1.5 times the system design working pressure but not less than 100 psi. '
         'Tests must hold for a minimum of 15 minutes with no leakage. Testing '
         'must be witnessed by the code official or approved third-party inspector. '
         'PEX and other plastic piping systems must be tested within the temperature '
         'and pressure limits of the material. All test equipment and procedures '
         'must be documented for the permit file.'),
    ])
    # Ch 13 - Fuel Oil Piping
    _ins(conn, bid, _ch(conn, bid, '13'), [
        ('1301', 'General',
         'Section 1301 covers fuel oil piping and storage for oil-fired heating '
         'equipment including furnaces, boilers, and unit heaters. Fuel oil systems '
         'must be installed per Chapter 13 and NFPA 31 (Standard for the Installation '
         'of Oil-Burning Equipment). Section 1301.2 requires fuel oil systems to be '
         'designed by a qualified professional when serving systems over 5 gallons '
         'per hour consumption rate. Safety shutoffs and fuel oil filters are '
         'required per Section 1301.5.'),
        ('1302', 'Materials',
         'Section 1302 lists approved materials for fuel oil piping: black steel '
         'pipe (ASTM A53), copper tubing (ASTM B88 Type L or K), and CSST (corrugated '
         'stainless steel tubing) listed for fuel oil service. Galvanized pipe is '
         'NOT permitted for fuel oil because zinc reacts with some oil additives. '
         'Flexible connectors between rigid piping and equipment must be listed for '
         'fuel oil service and limited to 24 inches in length. Section 1302.3 '
         'requires fittings to be compatible with the piping material.'),
        ('1305', 'Oil Storage Tanks',
         'Section 1305 governs fuel oil storage tanks. Above-ground tanks must be '
         'constructed per UL 80 (steel) or UL 1746 (protected steel) and located '
         'away from ignition sources. Tanks over 660 gallons or located in areas '
         'where spills could reach waterways require secondary containment. Fill '
         'and vent connections must be accessible and protected from weather. '
         'Underground tanks are regulated by EPA UST regulations and state '
         'environmental agencies in addition to the IMC.'),
    ])
    # Ch 14 - Solar Thermal
    _ins(conn, bid, _ch(conn, bid, '14'), [
        ('1401', 'General',
         'Section 1401 establishes that solar thermal energy systems must be installed '
         'per Chapter 14 and the manufacturer\'s listing. Solar thermal systems '
         'include flat-plate and evacuated-tube collectors, storage tanks, heat '
         'exchangers, and circulation pumps. Section 1401.2 requires systems to '
         'be designed to prevent overheating, freezing, and overpressure. Solar '
         'thermal systems in commercial buildings can contribute to energy code '
         'compliance and LEED points.'),
        ('1402', 'Installation',
         'Section 1402 requires solar thermal collectors to be installed per '
         'manufacturer listing, structural requirements, and with proper flashing '
         'at roof penetrations. Piping must withstand the maximum stagnation '
         'temperature of the collectors, which can exceed 400°F in flat-plate '
         'systems. Section 1402.3 requires pressure relief valves on all closed-loop '
         'solar thermal systems. Freeze protection must be provided by drainback '
         'design, antifreeze fluid, or heat tape for installations in climates with '
         'freezing temperatures.'),
        ('1403', 'Heat Transfer Fluids',
         'Section 1403 specifies that heat transfer fluids in solar thermal systems '
         'must be compatible with the piping and component materials. Where the '
         'solar loop is connected to potable water systems, only food-grade propylene '
         'glycol antifreeze is permitted — ethylene glycol is prohibited in potable '
         'water applications. Section 1403.2 requires inhibited glycol formulations '
         'to prevent corrosion of copper and aluminum components. Fluid pH and '
         'freeze protection must be tested and maintained per manufacturer '
         'recommendations.'),
    ])
    # Ch 15 - Referenced Standards
    _ins(conn, bid, _ch(conn, bid, '15'), [
        ('1501', 'General',
         'Chapter 15 lists all standards referenced in the IMC that are enforceable '
         'as part of the code. Key standards include ASHRAE 62.1 (Ventilation for '
         'Acceptable Indoor Air Quality), ASHRAE 15 (Safety Standard for Refrigeration '
         'Systems), SMACNA HVAC Duct Construction Standards, ACCA Manual J (Load '
         'Calculations), ACCA Manual D (Duct Design), ACCA Manual S (Equipment '
         'Selection), NFPA 54 (National Fuel Gas Code), NFPA 96 (Commercial Cooking '
         'Ventilation), and AHRI standards for equipment ratings. Compliance with '
         'the listed edition of each standard is required.'),
    ])

# ── IFGC (International Fuel Gas Code 2021) ──────────────────────

def _seed_ifgc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'Chapter 1 of the IFGC establishes scope, applicability, and administrative provisions for '
        'fuel gas systems including natural gas, LP-gas, and manufactured gas piping and appliances. '
        'Gas permits are required before installation or alteration of any gas piping or appliance '
        'connection. The code official has authority to inspect, approve, and require testing of all '
        'gas installations. HVAC contractors in Oklahoma must hold a state gas technician license '
        'in addition to mechanical contractor licensing to perform gas work.')
    _update_content(conn, bid, '2',
        'Chapter 2 provides definitions for fuel gas code terms including APPLIANCE CONNECTOR, '
        'DRAFT HOOD, DRIP, FLUE, GAS PIPING, LISTED, PRESSURE REGULATOR, SEDIMENT TRAP, '
        'and VENT. Precise understanding of these terms is critical because gas code requirements '
        'are written around them. For example, the definition of APPLIANCE CONNECTOR (the flexible '
        'or semi-rigid connector between the gas piping and the appliance) limits its length to '
        '6 feet and prohibits routing through walls, floors, or ceilings.')
    _update_content(conn, bid, '3',
        'Chapter 3 covers general regulations for gas appliance installation including listing '
        'and labeling requirements, structural safety, combustion and ventilation air, access and '
        'clearance requirements, and sediment trap installation. Section 304 is critical for HVAC '
        'contractors — it specifies combustion air requirements using the indoor air method or '
        'outdoor air method. Section 305 requires a drip leg (sediment trap) within 6 inches '
        'upstream of every gas appliance connection to prevent debris from entering the appliance.')
    _update_content(conn, bid, '4',
        'Chapter 4 contains the most referenced provisions for HVAC contractors: gas piping sizing, '
        'materials, installation, testing, and purging. Table 402.4 series provides pipe sizing for '
        'natural gas at various supply pressures using the longest-length or branch-length method. '
        'CSST (corrugated stainless steel tubing) must be bonded per Section 310.1.1 to prevent '
        'lightning-induced arc damage. All new gas piping must be pressure tested at 1.5 times '
        'working pressure (minimum 3 psi) for 10 minutes before being placed in service.')
    _update_content(conn, bid, '5',
        'Chapter 5 covers chimneys and venting systems for fuel-burning appliances. HVAC '
        'contractors must vent all gas appliances per this chapter using the vent category '
        'system (I through IV) that matches the appliance flue gas temperature and pressure. '
        'Section 503 covers single-appliance venting using the sizing tables in Appendix B. '
        'Section 504 addresses multi-appliance common venting, which is the most common '
        'scenario (furnace + water heater on a common flue) and requires careful sizing to '
        'ensure adequate draft for both appliances.')
    _update_content(conn, bid, '6',
        'Chapter 6 contains installation requirements specific to each type of gas appliance. '
        'Section 612 covers gas-fired forced-air furnaces including clearances, duct connections, '
        'filter requirements, and condensate disposal for high-efficiency condensing furnaces. '
        'Section 618 addresses unit heaters, and Section 621 covers gas ranges and ovens. '
        'HVAC contractors must verify that each appliance type is installed per its specific '
        'section requirements in addition to the general requirements of Chapter 3.')
    _update_content(conn, bid, '7',
        'Chapter 7 covers gaseous hydrogen systems, which are emerging in HVAC applications '
        'including hydrogen fuel cells and hydrogen-blended natural gas. Requirements include '
        'special materials compatible with hydrogen (no copper or brass for high-pressure systems), '
        'ventilation for hydrogen\'s wide flammable range (4-75%), and electrical classification '
        'of areas around hydrogen storage. Most HVAC contractors will not encounter Chapter 7 '
        'applications in typical residential and commercial work.')
    _update_content(conn, bid, '8',
        'Chapter 8 lists all referenced standards in the IFGC, most importantly NFPA 54 '
        '(National Fuel Gas Code), which is the primary companion standard. ANSI Z21 series '
        'standards cover specific appliance types (Z21.47 for central furnaces, Z21.13 for '
        'gas-fired boilers, Z21.10 for water heaters). ANSI LC1 covers CSST installation. '
        'ASTM standards govern pipe and fitting materials. Compliance with the specific '
        'edition of each standard listed in Chapter 8 is mandatory.')

    # ── Depth=1 sections ───────────────────────────────────────────
    _ins(conn, bid, _ch(conn, bid, '1'), [
        ('101', 'Scope and General',
         'Section 101 defines the scope of the IFGC as covering the design, installation, '
         'maintenance, alteration, and inspection of fuel gas piping systems, fuel gas '
         'appliances, and related accessories from the point of delivery to the inlet '
         'connection of each appliance. The code applies to natural gas, liquefied '
         'petroleum gas (LP-gas), and manufactured gas systems. Section 101.2 excludes '
         'utility gas distribution mains but includes the service piping from the meter '
         'or regulator to all appliances. HVAC contractors are responsible for all gas '
         'piping on the downstream side of the utility meter.'),
        ('102', 'Applicability',
         'Section 102 states that existing gas installations lawfully in place at the '
         'time of code adoption may remain in service if they are safe and not a hazard. '
         'When additions, alterations, or repairs are made, those portions must comply '
         'with current IFGC requirements. Gas piping in buildings under construction '
         'must be pressure tested before concealment and before placing in service. '
         'Section 102.7 permits the code official to approve alternative materials or '
         'methods that meet the intent of the code when substantiated by evidence or '
         'testing.'),
        ('106', 'Permits',
         'Section 106 requires a gas permit to be obtained before the installation, '
         'extension, alteration, or replacement of any gas piping system or appliance '
         'that requires a connection to the piping system. Exemptions include portable '
         'gas appliances connected with listed connectors, and like-for-like appliance '
         'replacements in some jurisdictions. Section 106.3 requires permit applications '
         'to include a gas piping layout, appliance schedule with Btu/hr inputs, and '
         'pipe sizing calculations. Permits must be posted at the job site until final '
         'approval is granted.'),
    ])
    _ins(conn, bid, _ch(conn, bid, '2'), [
        ('201', 'General',
         'Section 201 provides definitions for terms used throughout the IFGC. Critical '
         'definitions for HVAC contractors include: APPLIANCE CONNECTOR (factory-fabricated '
         'assembly used to connect appliance to the gas supply piping, limited to 6 feet '
         'and prohibited from passing through walls); CSST (corrugated stainless steel '
         'tubing meeting ANSI LC1); SEDIMENT TRAP (a tee fitting assembly installed to '
         'collect pipe scale, moisture, and debris before it reaches the appliance); and '
         'VENT (a conduit for conveying combustion products to the outdoors).'),
    ])
    _ins(conn, bid, _ch(conn, bid, '3'), [
        ('301', 'General',
         'Section 301 requires all gas appliances and equipment to be listed by an approved '
         'third-party testing agency (UL, CSA, ETL) and labeled for the type of gas being '
         'used (natural gas or LP-gas — they are not interchangeable without conversion '
         'kits). Unlisted appliances are not permitted unless specifically approved by the '
         'code official per Section 301.3. Section 301.7 requires gas equipment to be '
         'maintained in safe operating condition; the code official may order unsafe '
         'equipment to be taken out of service.'),
        ('302', 'Structural Safety',
         'Section 302 requires gas appliances and equipment to be installed on supports '
         'capable of bearing the full appliance weight plus operating loads without '
         'damaging the structure. Gas piping must not be used as a structural support '
         'element. Appliance connections must not impose stress on gas piping — flexible '
         'connectors absorb appliance movement and vibration. Seismic bracing of gas '
         'appliances is required per IBC Chapter 16 in seismic design categories C '
         'and above.'),
        ('303', 'Appliance Location',
         'Section 303 establishes location restrictions for gas appliances. Section '
         '303.3 requires gas appliances installed in garages to have the pilot and '
         'main burner ignition source elevated at least 18 inches above the floor to '
         'prevent ignition of flammable vapors that may accumulate at floor level. '
         'Gas-fired appliances are generally prohibited in sleeping rooms, bathrooms, '
         'and storage closets unless they are direct-vent (sealed combustion) type. '
         'Appliances in attics and crawl spaces must have access per Section 306.'),
        ('304', 'Combustion, Ventilation, Dilution Air',
         'Section 304 is one of the most important sections for gas appliance installation. '
         'The indoor air method requires a minimum of 50 cubic feet of indoor air volume '
         'per 1,000 Btu/hr of total connected appliance input. If the space is confined '
         '(less than required volume), two openings to adjacent spaces are required — '
         'each at 1 sq inch per 1,000 Btu/hr minimum free area. The outdoor air method '
         'requires openings per Section 304.6: one within 12 inches of ceiling and one '
         'within 12 inches of floor, each at 1 sq inch per 4,000 Btu/hr for horizontal '
         'ducts. Direct-vent sealed-combustion appliances are exempt from these requirements.'),
        ('305', 'Installation',
         'Section 305 requires gas appliances to be accessible for service without '
         'removing permanent construction. Section 305.2 requires a listed sediment '
         'trap (drip leg) installed in the gas supply line immediately upstream of each '
         'appliance, within 6 inches of the appliance inlet. The sediment trap consists '
         'of a tee with a capped nipple pointing downward to collect scale and moisture. '
         'Section 305.3 requires shutoff valves within 6 feet of each appliance and '
         'within the same room as the appliance.'),
        ('306', 'Access and Service Space',
         'Section 306 requires a minimum working clearance of 30 inches in front of all '
         'gas appliance service access panels and controls. Attic-installed appliances '
         'require a passageway at least 22 inches wide by 30 inches high from the access '
         'opening to the appliance, plus a level platform 30 inches by 30 inches at the '
         'appliance per Section 306.3. Crawl space installations require 24 inches of '
         'clearance to the bottom of the lowest appliance component. These requirements '
         'are frequently cited during inspections of residential HVAC installations.'),
    ])
    _ins(conn, bid, _ch(conn, bid, '4'), [
        ('401', 'General',
         'Section 401 requires gas piping systems to be designed for the maximum '
         'anticipated pressure and flow rate. The designer must use either the '
         'longest-length method or the branch-length method per Section 402 to size '
         'all portions of the system. A gas shutoff valve must be provided at the '
         'meter or service regulator and at each appliance. Section 401.5 requires '
         'gas pressure to be within the range listed on the appliance nameplate — '
         'typically 3.5 to 14 inches WC for natural gas appliances.'),
        ('402', 'Pipe Sizing',
         'Section 402 requires gas piping to be sized to provide adequate pressure '
         'at each appliance under simultaneous full-load conditions, with a maximum '
         'allowable pressure drop specified in Table 402.4. Tables 402.4(1) through '
         '402.4(34) provide pipe capacities for natural gas and LP-gas at various '
         'pressures and pressure drops for steel, copper, CSST, and PE pipe. For a '
         'typical residential system at 0.5 psi delivery pressure with 0.3 inch WC '
         'allowable drop, a 1/2-inch steel pipe carries approximately 40 CFH — '
         'contractors must size for the total connected Btu/hr load.'),
        ('403', 'Piping Materials',
         'Section 403 lists approved gas piping materials: Schedule 40 black steel '
         'pipe with threaded malleable iron fittings (most common for commercial); '
         'copper tubing (Types K and L, ASTM B88) with wrought copper or brass '
         'fittings for natural gas only (not LP-gas where copper reacts with LP '
         'odorants); CSST per ANSI LC1 — must be bonded per Section 310.1.1 with '
         'a minimum 6 AWG copper bonding conductor connected to the electrical '
         'grounding system; and polyethylene (PE) pipe for outdoor underground '
         'only. Yellow CSST and black PE pipe are the most common modern materials '
         'for residential gas distribution.'),
        ('404', 'Piping System Installation',
         'Section 404 requires underground gas piping to be buried at minimum 12 '
         'inches below grade for metallic pipe and 18 inches for PE. Piping '
         'through or under concrete slabs must be sleeved with an approved '
         'conduit or coating. Gas piping must not be installed in or through '
         'air ducts, clothes chutes, chimneys, or elevator shafts. Section '
         '404.9 requires piping to be protected from corrosion with approved '
         'coatings or cathodic protection for underground metallic piping. '
         'Above-ground piping must be installed in exposed locations or in '
         'conduit in concealed locations.'),
        ('405', 'Gas Shutoff Valves',
         'Section 405 requires a listed manual shutoff valve within 6 feet of '
         'each appliance in the same room. Valves must be accessible and operable '
         'without tools. Section 405.3 requires a main shutoff valve at the '
         'point of delivery (upstream side of the meter). Valves for appliances '
         'installed above the first floor must have the valve on the same floor '
         'as the appliance. Quarter-turn ball valves are the preferred type; '
         'lubricated plug valves are also acceptable. Valves must be UL '
         'or CSA listed for the operating pressure.'),
        ('406', 'Piping Testing',
         'Section 406 requires all new gas piping to be pressure tested before '
         'being placed in service and before covering or concealing. Test pressure '
         'must be at least 1.5 times the working pressure but no less than 3 psi '
         'for systems operating at 14 inches WC or less. The test medium must be '
         'air, nitrogen, or carbon dioxide — natural gas is NOT permitted as a '
         'test medium. Test duration is a minimum of 10 minutes with no pressure '
         'drop. Leaks must be located with liquid leak detector solution, never '
         'an open flame. All test results must be documented for the permit file.'),
        ('408', 'Piping Purging',
         'Section 408 requires gas piping to be purged of air before placing '
         'appliances in service to prevent an explosive air-gas mixture in the '
         'piping. Purging must be performed by a qualified gas technician per '
         'utility company procedures. Purge gas must be discharged to the '
         'outdoors at a safe location away from ignition sources. Section '
         '408.3 requires the piping to be purged a minimum of 3 pipe volumes. '
         'Appliances must not be lit until purging is complete and residual '
         'purge gas has dissipated.'),
        ('411', 'Appliance Connections',
         'Section 411 covers the final connection from rigid gas piping to the '
         'appliance. Listed flexible appliance connectors must be used and are '
         'limited to 6 feet in length. Connectors may not be concealed within '
         'walls, floors, or ceilings, and may not pass through walls, floors, '
         'or ceilings. Section 411.1.3 prohibits reusing old connectors — they '
         'must be replaced with new listed connectors on appliance replacement. '
         'Connectors must be appropriate for the appliance type (range connectors '
         'for ranges, dryer connectors for dryers) and compatible with the gas type.'),
    ])
    _ins(conn, bid, _ch(conn, bid, '5'), [
        ('501', 'General',
         'Section 501 requires all vented gas appliances to be connected to a venting '
         'system that safely conveys all combustion products to the outdoors. Vents '
         'must be gas-tight to prevent leakage of combustion products into the building. '
         'Section 501.6 prohibits connecting Category I appliances (atmospheric, '
         'non-condensing) to venting systems designed for Category II, III, or IV '
         'appliances without specific approval. Unvented gas appliances are permitted '
         'only in specific applications per Section 501.8, and many jurisdictions '
         'prohibit them entirely.'),
        ('502', 'Vent Components',
         'Section 502 lists approved vent materials: Type B gas vent (double-wall aluminum '
         'inner, galvanized outer) for Category I appliances; Type L vent for oil-burning '
         'appliances; single-wall galvanized connectors from appliance to vent; and '
         'AL29-4C or polypropylene vent for Category II and IV condensing appliances. '
         'PVC and CPVC vent pipe may be used only for specific listed appliances in '
         'the Category IV classification. Section 502.4 requires all vent components '
         'to be listed for their intended use and compatible with adjacent components.'),
        ('503', 'Single-Appliance Venting',
         'Section 503 and Appendix B Tables B-1 through B-11 provide sizing for '
         'single-appliance vent systems. Sizing requires knowing the appliance Btu/hr '
         'input, the total vent height (H), and the total lateral length (L). Using '
         'Table B-1 for Type B vent with a Category I furnace: for an 80,000 Btu/hr '
         'furnace with 20 ft of height and 2 ft lateral, a 4-inch Type B vent is '
         'required. Section 503.5 requires all connectors to maintain a minimum '
         '1/4-inch per foot upward slope to the vent. Connectors must be secured '
         'at joints with sheet metal screws.'),
        ('504', 'Multi-Appliance Venting',
         'Section 504 covers common-vent systems serving two or more Category I '
         'appliances. Tables B-12 through B-19 provide sizing for common vent '
         'configurations. The most common residential scenario — gas furnace and '
         'gas water heater on a common vent — requires sizing both the individual '
         'connectors and the common vent portion for combined input. Section 504.3 '
         'addresses the orphaned water heater condition: when a furnace sharing a '
         'common vent is replaced with a direct-vent unit, the remaining water heater '
         'is "orphaned" and the common vent must be re-sized for the single appliance. '
         'This frequently requires reducing the vent diameter or adding a liner.'),
        ('505', 'Direct-Vent Appliances',
         'Section 505 permits direct-vent (sealed combustion) appliances to vent '
         'directly through exterior walls using factory-specified co-axial vent/air '
         'intake kits. Direct-vent appliances draw combustion air from outdoors '
         'and exhaust to the outdoors in a sealed system, making them safe for '
         'installation in any location including closets and bedrooms. Section '
         '505.1 requires the vent/intake kit to be listed with the appliance. '
         'Minimum clearances from terminations: 12 inches from doors and windows, '
         '12 inches above grade, and no closer than the appliance manufacturer '
         'specifies from corners and adjacent surfaces.'),
    ])
    _ins(conn, bid, _ch(conn, bid, '6'), [
        ('601', 'General',
         'Section 601 establishes that all specific appliances covered in Chapter 6 '
         'must comply with both the general requirements of Chapter 3 and the '
         'appliance-specific requirements of the applicable section in Chapter 6. '
         'Appliances must be listed for the gas type being used (natural gas or '
         'LP-gas) and operate within the pressure range stamped on the rating plate. '
         'Section 601.2 requires appliances to be installed on noncombustible floors '
         'or have listed legs or bases providing at least 6 inches of clearance '
         'when required by the listing.'),
        ('602', 'Decorative Gas Appliances',
         'Section 602 covers decorative gas appliances including gas log sets, '
         'gas fireplaces, and decorative gas burners used in fireplaces and '
         'hearth applications. Vented gas log sets must be installed in masonry '
         'fireplaces with the damper held permanently open. Vent-free gas log '
         'sets are permitted where allowed by local jurisdiction, limited to '
         'specific room sizes per the listing, and may not be used in bedrooms '
         'or bathrooms. All decorative appliances must be listed per ANSI Z21.60 '
         'or Z21.84 as applicable.'),
        ('603', 'Gas Fireplaces',
         'Section 603 covers factory-built gas fireplaces including direct-vent '
         'and B-vent types. Direct-vent gas fireplaces draw combustion air from '
         'outdoors and are permitted in all rooms including bedrooms. B-vent '
         'fireplaces require indoor combustion air and are limited per Section '
         '304 combustion air requirements. Section 603.4 requires clearances to '
         'combustibles per the listing. Gas fireplaces must be installed per '
         'ANSI Z21.88 (direct-vent) or Z21.50 (B-vent) listing requirements.'),
        ('612', 'Forced Air Furnaces',
         'Section 612 covers gas-fired central forced-air furnaces — the most common '
         'gas appliance HVAC contractors install. Section 612.1 requires furnaces '
         'to comply with ANSI Z21.47. Section 612.5 requires supply and return '
         'ductwork to be designed per ACCA Manual D with static pressure not '
         'exceeding the furnace ratings. Section 612.6 requires condensate from '
         '90%+ AFUE condensing furnaces to be disposed of per IMC Section 307. '
         'High-efficiency condensing furnaces use PVC vent and must not be connected '
         'to existing B-vent or masonry chimney systems.'),
        ('618', 'Unit Heaters',
         'Section 618 covers suspended, floor-mounted, and wall-mounted gas-fired '
         'unit heaters used in commercial and industrial spaces. Section 618.6 '
         'requires venting per Chapter 5 unless the unit is specifically listed '
         'as unvented for the space volume. Clearances from combustibles must '
         'follow the listing — typically 18 inches from ceiling for ceiling-mounted '
         'units. Propeller fans must blow away from walls and obstructions. '
         'Infrared radiant tube heaters are also commonly covered here and must '
         'maintain minimum clearances from occupants and combustibles per their '
         'listing.'),
        ('621', 'Gas Ranges',
         'Section 621 covers gas cooking appliances including ranges, ovens, '
         'broilers, and counter-top cooking units. Freestanding ranges require '
         'flexible connectors limited to 6 feet per Section 411. Section 621.3 '
         'requires a 30-inch minimum clearance above the cooktop to an overhead '
         'unprotected combustible cabinet. Built-in ovens must have 18-inch '
         'clearance to combustibles on the sides. Anti-tip devices are required '
         'on all freestanding ranges. Kitchen exhaust hoods must provide Type II '
         'ventilation for residential ranges per IMC Section 505.'),
        ('701', 'General',
         'Section 701 establishes requirements for gaseous hydrogen piping and '
         'storage systems used in fuel cell power systems, backup power, and '
         'emerging hydrogen appliance applications. Hydrogen piping materials '
         'are limited to austenitic stainless steel, copper, and aluminum '
         '(brass and bronze are not acceptable at high pressures). Areas '
         'containing hydrogen equipment must be classified per NFPA 2 and '
         'NFPA 55. Hydrogen systems must include leak detection, emergency '
         'shutoff, and pressure relief per the specific requirements of Section '
         '701.'),
        ('801', 'Referenced Standards',
         'Chapter 8 lists all standards referenced in the IFGC including: NFPA 54 '
         '(National Fuel Gas Code) — the companion standard providing detailed '
         'engineering requirements; ANSI Z21 series covering specific appliance '
         'types; ANSI LC1 for CSST installation; ASTM A53 for steel pipe; ASTM '
         'B88 for copper tubing; NFPA 58 for LP-gas storage and handling; and '
         'NFPA 2 for hydrogen systems. The edition of each referenced standard '
         'that is listed in Chapter 8 is the enforceable version, even if a newer '
         'edition has been published.'),
    ])

# ── IECC (International Energy Conservation Code 2021) ────────────

def _seed_iecc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, 'C1',
        'Chapter C1 establishes the scope and administrative provisions of the IECC '
        'Commercial provisions. It covers energy efficiency requirements for all commercial '
        'buildings and high-rise residential buildings (four stories and above). Compliance '
        'is verified through plan review and inspection by the code official. Oklahoma '
        'adopted the IECC with state amendments; contractors should verify the adopted '
        'edition and any local amendments before designing or submitting energy compliance '
        'documentation for commercial projects.')
    _update_content(conn, bid, 'C2',
        'Chapter C2 defines terms used in the commercial energy provisions including '
        'BUILDING THERMAL ENVELOPE, CONDITIONED SPACE, CLIMATE ZONE, CONTINUOUS AIR '
        'BARRIER, ECONOMIZER, ENERGY COST BUDGET, FENESTRATION, and INFILTRATION. '
        'Understanding these definitions is essential because IECC requirements are '
        'often keyed to whether a space is conditioned or unconditioned, and the '
        'required insulation levels differ significantly based on this classification.')
    _update_content(conn, bid, 'C3',
        'Chapter C3 establishes climate zones used throughout the commercial energy '
        'provisions. Oklahoma is primarily in Climate Zone 3A (mixed-humid), with the '
        'panhandle in Zone 4B. Climate zone determines insulation R-values, window '
        'U-factors, SHGC limits, and HVAC system requirements. HVAC contractors '
        'must confirm the applicable climate zone for each project location before '
        'selecting equipment efficiencies and insulation specifications.')
    _update_content(conn, bid, 'C4',
        'Chapter C4 contains the prescriptive compliance requirements for commercial '
        'buildings including building envelope (Section C402), HVAC systems (Section '
        'C403), service water heating (Section C404), lighting (Section C405), and '
        'other equipment (Section C406). Section C403 is the most relevant for HVAC '
        'contractors, specifying minimum equipment efficiencies, economizer requirements, '
        'duct sealing standards, piping insulation, and control requirements. Compliance '
        'documentation for HVAC must include equipment schedules with certified ratings.')
    _update_content(conn, bid, 'C5',
        'Chapter C5 lists all standards referenced in the IECC Commercial provisions '
        'including ASHRAE 90.1 (which serves as an alternative compliance path), '
        'ASHRAE 62.1, AHRI standards for equipment efficiency ratings, ASTM standards '
        'for testing materials, and SMACNA standards for duct construction. ASHRAE 90.1 '
        'compliance is accepted as an equivalent alternative to IECC Chapter C4 '
        'compliance for commercial buildings.')
    _update_content(conn, bid, 'R1',
        'Chapter R1 establishes the scope and administrative provisions of the IECC '
        'Residential provisions, which apply to detached one- and two-family dwellings '
        'and townhouses three stories or less above grade. HVAC contractors must provide '
        'energy compliance documentation at permit submission, including Manual J load '
        'calculations, Manual S equipment selection, and Manual D duct design. Oklahoma '
        'requires blower door testing in new construction to verify air sealing.')
    _update_content(conn, bid, 'R2',
        'Chapter R2 defines terms used in the residential energy provisions including '
        'CONDITIONED FLOOR AREA, CONTINUOUS AIR BARRIER, DUCT SYSTEM, FENESTRATION, '
        'HEATING SEASONAL PERFORMANCE FACTOR (HSPF), R-VALUE, SEASONAL ENERGY '
        'EFFICIENCY RATIO (SEER), and THERMAL ENVELOPE. SEER2 and HSPF2 ratings '
        'replace legacy SEER and HSPF ratings for equipment manufactured after '
        'January 1, 2023.')
    _update_content(conn, bid, 'R3',
        'Chapter R3 covers general requirements for residential energy compliance '
        'including climate zone determination, design conditions, fenestration limits, '
        'and compliance pathway selection. Oklahoma is Climate Zone 3A, which requires '
        'specific insulation levels: ceiling R-38 (or R-49 in some paths), wall R-20 '
        'or R-13+5ci, floor R-19, and slab R-10 perimeter. Compliance may be achieved '
        'via prescriptive, performance, or Energy Rating Index (ERI) paths.')
    _update_content(conn, bid, 'R4',
        'Chapter R4 contains all prescriptive residential energy efficiency requirements. '
        'Section R402 covers building thermal envelope — insulation levels, fenestration '
        'U-factors (max U-0.30 in CZ 3), SHGC limits (max 0.25), and air sealing '
        'requirements (blower door ≤5 ACH50). Section R403 covers HVAC systems including '
        'minimum efficiencies (14 SEER2/8.2 HSPF2 for heat pumps, 80% AFUE minimum for '
        'furnaces), duct sealing (≤4 CFM25 per 100 sq ft), and thermostat requirements. '
        'Section R404 covers service water heating efficiency.')
    _update_content(conn, bid, 'R5',
        'Chapter R5 lists referenced standards for the residential energy provisions '
        'including ACCA Manual J for load calculations, Manual S for equipment '
        'selection, Manual D for duct design, ASHRAE 62.2 for residential ventilation, '
        'AHRI 210/240 for unitary AC and heat pump ratings, and AHRI 310/380 for '
        'packaged terminal equipment. Compliance with the listed edition of each '
        'standard is required.')

    # ── Depth=1 sections ───────────────────────────────────────────
    _ins(conn, bid, _ch(conn, bid, 'C1'), [
        ('C101', 'Scope and General',
         'Section C101 establishes the scope of the IECC Commercial energy provisions, '
         'applying to all new commercial buildings and additions and alterations to existing '
         'commercial buildings. Buildings four stories or more in height are commercial '
         'regardless of occupancy. Compliance may be demonstrated via the prescriptive '
         'path (Chapter C4), the total building performance path (Section C407), or by '
         'complying with ASHRAE Standard 90.1 as an approved alternate. The code official '
         'must be provided with energy compliance documentation at permit submission, '
         'including equipment schedules with certified efficiency ratings.'),
        ('C102', 'Applicability',
         'Section C102 states that additions to existing buildings need only comply for '
         'the addition itself, not the entire existing building, unless the addition '
         'exceeds 50% of the existing building\'s conditioned floor area. Alterations '
         'to existing HVAC systems must meet current equipment efficiency requirements '
         'when the system is replaced. Section C102.1.1 permits the code official to '
         'accept existing conditions in renovation projects where compliance would '
         'require extensive structural or mechanical changes, provided the overall '
         'energy use does not increase.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'C2'), [
        ('C201', 'General',
         'Section C201 provides definitions for commercial energy terms. ECONOMIZER is '
         'defined as a system that uses outdoor air to reduce or eliminate mechanical '
         'cooling; it is required in Oklahoma (CZ 3A) for cooling systems exceeding '
         '54,000 Btu/hr per Table C403.5. CONDITIONED SPACE is space that is heated or '
         'cooled to maintain occupant comfort; spaces with supply air but no thermostat '
         'control may be unconditioned. BUILDING THERMAL ENVELOPE is the assembly of '
         'elements (walls, roof, floor, windows) separating conditioned from unconditioned '
         'spaces or the outdoors.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'C3'), [
        ('C301', 'Climate Zones',
         'Section C301 defines the climate zone map and lists county-by-county assignments '
         'for all U.S. locations. Oklahoma falls primarily in Climate Zone 3A (mixed-humid) '
         'with the panhandle counties (Cimarron, Texas, Beaver) in Zone 4B. Climate zone '
         'determines envelope requirements in Table C402.1.3, fenestration limits in '
         'Table C402.4, economizer requirements, and minimum equipment efficiencies. '
         'All HVAC submittals must clearly state the applicable climate zone. Zone 3A '
         'is characterized by more than 2,000 cooling degree days and fewer than '
         '5,400 heating degree days.'),
        ('C302', 'Design Conditions',
         'Section C302 requires HVAC systems to be sized based on outdoor design '
         'conditions per ASHRAE Fundamentals, Chapter 14. For Oklahoma City, design '
         'conditions are approximately 97°F dry bulb / 75°F wet bulb for cooling '
         'and 11°F for heating. Load calculations per ACCA Manual J or ASHRAE '
         'Handbook of Fundamentals are required. Equipment must not be oversized '
         'by more than 115% of the design cooling load or 40% above the design '
         'heating load per ACCA Manual S to ensure proper humidity control and '
         'system efficiency.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'C4'), [
        ('C403', 'HVAC Systems',
         'Section C403 is the primary HVAC compliance section for commercial energy '
         'efficiency. Minimum equipment efficiencies are specified in Tables C403.3.2(1) '
         'through C403.3.2(14) by equipment type, capacity range, and climate zone. '
         'For unitary cooling equipment: systems under 65,000 Btu/hr must meet 14 SEER2 '
         'or 11.5 EER2; systems 65,000 to 135,000 Btu/hr must meet 11.5 EER2. Economizers '
         'per Section C403.5 are required for systems over 54,000 Btu/hr in CZ 3A. '
         'All ducts must be sealed and insulated per Section C403.11. Controls must '
         'provide setback during unoccupied periods per Section C403.4.1.'),
        ('C403.1', 'New Equipment Efficiency',
         'Table C403.3.2(1) through (14) specify the minimum efficiencies for commercial '
         'HVAC equipment. Split-system unitary air conditioners: less than 65,000 Btu/hr '
         'must meet 15 SEER2 / 12.2 EER2; 65,000 to 134,999 Btu/hr must meet 11.7 EER2; '
         'greater than 135,000 Btu/hr must meet 10.6 EER2. Single-package units have '
         'slightly different minimum EER requirements. Gas-fired packaged equipment '
         'furnace sections must be minimum 80% Et (thermal efficiency). Air-source heat '
         'pumps must meet 15 SEER2 / 7.5 HSPF2 for equipment under 65,000 Btu/hr.'),
        ('C403.2', 'HVAC Controls',
         'Section C403.4 requires HVAC controls for all commercial systems. Thermostats '
         'or controllers must have at least two programmable setpoints per day for at '
         'least 7 days. Section C403.4.1.1 requires a minimum 5°F deadband between '
         'heating and cooling setpoints to prevent simultaneous heating and cooling. '
         'Automatic setback is required to reduce heating setpoint to 55°F and cooling '
         'setpoint to 85°F during unoccupied periods. Demand-controlled ventilation '
         '(DCV) using CO2 sensors is required for spaces larger than 500 sq ft with '
         'design occupancy over 25 people per Section C403.3.1.'),
        ('C403.3', 'Economizers',
         'Section C403.5 requires air-side economizers on cooling systems with capacity '
         'over 54,000 Btu/hr in Climate Zone 3A. The economizer must be capable of '
         'providing 100% outdoor air when conditions permit free cooling. High-limit '
         'shutoff controls per Table C403.5.2 must stop economizer operation when '
         'outdoor conditions are not suitable for free cooling — for CZ 3A, a '
         'fixed dry-bulb high limit of 75°F is the simplest compliant control. '
         'Economizer fault detection (EFD) diagnostics are required per Section '
         'C403.5.4 to detect failed dampers or controls. Economizers dramatically '
         'reduce cooling energy use in Oklahoma\'s mild spring and fall seasons.'),
        ('C403.4', 'Duct Sealing and Insulation',
         'Section C403.11.2 requires all commercial duct systems to be sealed per '
         'SMACNA HVAC Air Duct Leakage Test Manual at a maximum of Leakage Class 12 '
         '(12 CFM per 100 sq ft of duct surface at 1 inch WC). Supply ducts in '
         'unconditioned spaces must be insulated to R-6 minimum; return ducts to '
         'R-3.5 minimum per Table C403.11.3. Systems over 25,000 CFM must be '
         'tested for duct leakage by a third-party testing agency and results '
         'submitted to the code official. Leakage testing is a growing requirement '
         'that HVAC contractors must build into project schedules.'),
        ('C403.5', 'Piping Insulation',
         'Section C403.11.3 and Table C403.11.3 specify minimum insulation thickness '
         'for HVAC piping. Chilled water and brine piping requires R-2.0 for pipe '
         'diameters up to 1.5 inches and up to R-4.6 for larger diameters. Steam '
         'condensate piping and hot water supply piping have insulation requirements '
         'based on temperature and diameter per Table C403.11.3. Refrigerant suction '
         'lines must be insulated to prevent condensation and capacity loss. '
         'Insulation must be continuous with no gaps at hangers and supports.'),
        ('C501', 'Referenced Standards',
         'Chapter C5 lists referenced standards including ASHRAE 90.1 (used as '
         'alternate compliance path), ASHRAE 62.1 (ventilation), ASHRAE 55 (thermal '
         'comfort), AHRI 210/240 (unitary equipment), AHRI 340/360 (commercial '
         'packaged equipment), AHRI 550/590 (water-cooled chillers), and SMACNA '
         'duct standards. Equipment rated under AHRI certification programs carries '
         'a certified rating that satisfies the IECC efficiency documentation '
         'requirement.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'R1'), [
        ('R101', 'Scope',
         'Section R101 establishes the scope of the IECC Residential provisions: '
         'detached one- and two-family dwellings, townhouses not more than three '
         'stories above grade plane, and their accessory structures when heated or '
         'cooled. Energy compliance documentation required at permit submission '
         'includes: climate zone, compliance path, insulation specifications, '
         'fenestration schedule with U-factors and SHGC values, HVAC equipment '
         'efficiencies, and either Manual J load calculations or equivalent sizing '
         'documentation. Oklahoma does not allow "rule of thumb" sizing for permitted '
         'new construction.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'R2'), [
        ('R201', 'General',
         'Section R201 provides key residential definitions. SEER2 and HSPF2 are the '
         'updated efficiency metrics replacing SEER and HSPF as of January 1, 2023 — '
         'equipment rated under the old metrics cannot be directly compared without '
         'conversion (approximately SEER2 = SEER × 0.95). CONTINUOUS AIR BARRIER '
         'is an assembly of materials that restricts airflow between the conditioned '
         'space and unconditioned space; it must be continuous across all six sides '
         'of the thermal envelope. THERMAL ENVELOPE is the assembly of floors, walls, '
         'roof/ceiling, and fenestration surrounding the conditioned space.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'R3'), [
        ('R301', 'Climate Zones',
         'Section R301 assigns all U.S. counties to climate zones 1 through 8. '
         'Oklahoma is primarily Climate Zone 3A (mixed-humid): ceiling insulation '
         'minimum R-38 (or R-49 for unvented attics), wall R-20 cavity or R-13+5ci, '
         'floor R-19, basement R-10/13, slab R-10 edge. Window maximum U-factor '
         '0.30, SHGC 0.25. The panhandle (Cimarron/Texas/Beaver counties) is Zone '
         '4B: ceiling R-49, wall R-20+5ci or R-13+10ci, same window U-factor but '
         'no SHGC limit. Contractors must confirm the correct zone for the project '
         'site before specifying insulation packages.'),
    ])
    _ins(conn, bid, _ch(conn, bid, 'R4'), [
        ('R403', 'Systems',
         'Section R403 covers residential HVAC system requirements for energy '
         'compliance. Section R403.1.1 requires programmable thermostats with '
         '7-day, 4-setpoint capability for all forced-air systems. Section R403.3 '
         'requires duct systems to be sealed at all joints and seams with mastic '
         'or listed tape — duct leakage must not exceed 4 CFM25 per 100 sq ft of '
         'conditioned floor area when tested per RESNET/ICC 380 or ASHRAE 152. '
         'Section R403.6 requires HVAC equipment to meet AHRI-certified minimum '
         'efficiencies: 15 SEER2 / 8.1 HSPF2 for heat pumps, 14.3 SEER2 for air '
         'conditioners, and 80% AFUE for gas furnaces in CZ 3A.'),
        ('R501', 'Referenced Standards',
         'Chapter R5 lists residential energy referenced standards including ACCA '
         'Manual J (load calculations), ACCA Manual S (equipment selection), ACCA '
         'Manual D (duct system design), ASHRAE 62.2 (residential ventilation — '
         'minimum 7.5 CFM per person plus 0.01 CFM/sq ft), AHRI 210/240 (unitary '
         'equipment ratings), ASTM E779 and ASTM E1827 (blower door testing), and '
         'RESNET/ICC 380 (duct leakage testing). Blower door testing results '
         '(≤5 ACH50 in CZ 3) must be submitted to the code official before '
         'certificate of occupancy is issued.'),
    ])

# ── IBC (International Building Code 2021) ───────────────────────

def _seed_ibc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'Chapter 1 establishes the administrative framework for the IBC including scope, '
        'applicability, enforcement authority, permits, inspections, and certificate of '
        'occupancy requirements. HVAC contractors must obtain mechanical permits separate '
        'from the building permit. The code official has authority to require special '
        'inspections of mechanical systems per Chapter 17.')
    _update_content(conn, bid, '2',
        'Chapter 2 provides definitions for terms used throughout the IBC. Key definitions '
        'affecting HVAC work include BUILDING AREA, FIRE BARRIER, FIRE PARTITION, SMOKE '
        'BARRIER, OCCUPANCY CLASSIFICATION, and STORY. These definitions determine which '
        'fire protection and mechanical requirements apply to a given project.')
    _update_content(conn, bid, '3',
        'Chapter 3 classifies buildings by occupancy type (A through U) and establishes '
        'special requirements for mixed-occupancy buildings. Occupancy classification '
        'determines egress requirements, sprinkler thresholds, fire resistance ratings, '
        'and interior environment requirements including mechanical ventilation rates. '
        'HVAC contractors must verify the occupancy classification early in design.')
    _update_content(conn, bid, '4',
        'Chapter 4 contains special detailed requirements for specific occupancy types '
        'including covered malls, high-rise buildings, atriums, underground structures, '
        'hazardous occupancies, and motor vehicle-related occupancies. High-rise buildings '
        '(occupied floors above 75 ft) trigger extensive HVAC requirements including '
        'smoke control systems, pressurization of stairwells, and emergency HVAC.')
    _update_content(conn, bid, '5',
        'Chapter 5 establishes allowable building heights and floor areas based on '
        'occupancy classification and type of construction (I through V). Automatic '
        'sprinkler systems allow increases in allowable height and area. Chapter 5 '
        'height limits affect rooftop mechanical equipment enclosure requirements '
        'and penthouse provisions.')
    _update_content(conn, bid, '6',
        'Chapter 6 defines five types of construction (I through V) based on the '
        'fire-resistance rating of structural and wall elements. Construction type '
        'determines which materials are permitted for ducts, duct insulation, and '
        'plenum spaces. Type I and II construction (noncombustible) restrict the use '
        'of combustible duct materials and insulation within buildings.')
    _update_content(conn, bid, '7',
        'Chapter 7 covers fire and smoke protection features including fire-resistance '
        'ratings, fire walls, fire barriers, fire partitions, smoke barriers, and '
        'horizontal assemblies. HVAC contractors must install fire dampers at duct '
        'penetrations through fire barriers and smoke dampers at smoke barriers per '
        'Section 717. Firestopping of all mechanical penetrations through rated '
        'assemblies is required per Section 714.')
    _update_content(conn, bid, '8',
        'Chapter 8 regulates interior wall, ceiling, and floor finish materials based '
        'on flame spread index (FSI) and smoke developed index (SDI). Materials used '
        'inside duct systems and plenums must comply with Chapter 8 limits. Duct '
        'insulation and duct liner materials must be tested per ASTM E84 and meet '
        'the FSI and SDI limits for the construction type and occupancy.')
    _update_content(conn, bid, '9',
        'Chapter 9 covers fire protection and life safety systems including automatic '
        'sprinkler systems (Section 903), standpipe systems (Section 905), fire alarm '
        'systems (Section 907), smoke control systems (Section 909), and carbon '
        'monoxide detection (Section 915). HVAC contractors must coordinate with fire '
        'protection contractors on smoke control, damper control wiring, and HVAC '
        'interlocks with fire alarm systems.')
    _update_content(conn, bid, '10',
        'Chapter 10 governs means of egress including occupant load calculations, '
        'number and width of exits, exit access corridors, exit enclosures, and exit '
        'discharge. HVAC contractors must ensure that mechanical equipment does not '
        'reduce required egress widths in corridors and mechanical rooms. Pressurization '
        'of exit stairwells is required in high-rise buildings per Section 909.20.')
    _update_content(conn, bid, '11',
        'Chapter 11 establishes accessibility requirements for buildings per ICC A117.1. '
        'HVAC contractors must ensure that mechanical controls and thermostats are '
        'mounted at accessible heights (15 to 48 inches above floor for side reach, '
        '48 inches maximum for forward reach) in all publicly accessible spaces.')
    _update_content(conn, bid, '12',
        'Chapter 12 covers interior environmental requirements including ventilation, '
        'temperature control, lighting, sound transmission, and sanitation. Section '
        '1202 requires all occupied spaces to be ventilated per IMC Chapter 4. Section '
        '1203 requires heated spaces to maintain at least 68°F. These requirements '
        'are the building code basis for HVAC system performance standards.')
    _update_content(conn, bid, '13',
        'Chapter 13 requires commercial buildings to comply with the IECC energy '
        'provisions or ASHRAE 90.1. HVAC systems must meet minimum efficiency '
        'requirements, economizer requirements, duct sealing, and control provisions '
        'as established in the IECC. Chapter 13 simply points to IECC; the detailed '
        'requirements are in the energy code.')
    _update_content(conn, bid, '14',
        'Chapter 14 covers exterior wall construction, cladding, and weather resistance. '
        'Penetrations through exterior walls for HVAC ductwork, piping, and wiring '
        'must be sealed against water infiltration per Section 1403. Flashing is '
        'required at all penetrations. Exterior equipment mounting requires structural '
        'coordination for wall blocking and penetration waterproofing.')
    _update_content(conn, bid, '15',
        'Chapter 15 covers roof assemblies and rooftop structures including material '
        'requirements, wind uplift, fire classification, and drainage. Rooftop mechanical '
        'equipment must be mounted on listed curbs or structural supports. Equipment '
        'weight and vibration loads must be communicated to the structural engineer. '
        'Penetrations for refrigerant lines, electrical conduit, and drain lines require '
        'approved flashing and waterproofing.')
    _update_content(conn, bid, '16',
        'Chapter 16 establishes structural design loads per ASCE 7 including dead, live, '
        'snow, wind, seismic, and flood loads. HVAC equipment mounted on roofs or '
        'walls must be designed for applicable wind and seismic loads. Oklahoma design '
        'wind speed ranges from 115 to 130 mph depending on location. Equipment must '
        'be anchored per the structural engineer\'s specifications.')
    _update_content(conn, bid, '17',
        'Chapter 17 requires special inspections for certain structural and mechanical '
        'work. HVAC seismic bracing may require special inspection in Seismic Design '
        'Categories C and above. Smoke control systems require commissioning per '
        'Section 909.18.8 including integrated testing with the fire alarm system.')
    _update_content(conn, bid, '18',
        'Chapter 18 covers foundation and soil requirements. HVAC contractors must '
        'coordinate with the geotechnical report when routing underground piping through '
        'expansive or problematic soils common in Oklahoma. Expansive clay soils may '
        'require sleeved penetrations or flexible connections for underground piping.')
    _update_content(conn, bid, '19',
        'Chapter 19 covers concrete construction per ACI 318. Concrete floors and '
        'slabs penetrated for mechanical sleeves must maintain structural integrity. '
        'Core drilling through structural concrete requires engineer approval. '
        'Conduit embedded in concrete must meet minimum cover and spacing requirements.')
    _update_content(conn, bid, '20',
        'Chapter 20 covers aluminum construction per AA ADM1. Aluminum is used in '
        'some HVAC components — equipment housings, duct components, and condensate '
        'pans. Aluminum must be protected from contact with concrete, masonry, and '
        'dissimilar metals that cause galvanic corrosion.')
    _update_content(conn, bid, '21',
        'Chapter 21 governs masonry construction per TMS 402/602. Mechanical contractors '
        'cutting or coring masonry walls for duct or pipe penetrations must preserve '
        'structural integrity and fire-resistance ratings. Openings in masonry must '
        'be reinforced and linteled per the masonry designer\'s requirements.')
    _update_content(conn, bid, '22',
        'Chapter 22 covers structural steel per AISC 360. Mechanical contractors must '
        'not cut, notch, or weld structural steel members without engineer approval. '
        'Equipment frames and supports welded to structural steel require inspection '
        'per Chapter 17 special inspection requirements.')
    _update_content(conn, bid, '23',
        'Chapter 23 governs wood construction per AWC NDS. Notching and drilling of '
        'wood joists and studs for mechanical piping and ductwork is limited by '
        'Section 2308. Notches in the top of joists shall not exceed 1/6 the depth; '
        'holes shall not exceed 1/3 the depth. These limits protect structural '
        'capacity and must be observed when routing ductwork or piping.')
    _update_content(conn, bid, '24',
        'Chapter 24 covers glazing and fenestration including safety glazing requirements '
        'and wind load resistance. HVAC contractors should note that energy code '
        'U-factor and SHGC requirements for windows and skylights are enforced through '
        'IBC Chapter 13 and IECC. Skylights used for natural ventilation must meet '
        'both energy and structural requirements.')
    _update_content(conn, bid, '25',
        'Chapter 25 covers gypsum board and plaster assemblies. HVAC contractors '
        'penetrating gypsum assemblies must restore the assembly\'s required fire '
        'and sound rating using tested systems. Annular spaces around duct and '
        'pipe penetrations must be properly patched or firestopped to maintain '
        'assembly ratings.')
    _update_content(conn, bid, '26',
        'Chapter 26 governs foam plastics including spray polyurethane foam (SPF) '
        'insulation. SPF used as pipe or duct insulation within a building must have '
        'an ignition barrier or thermal barrier unless listed for exposed installation. '
        'SPF in plenums must meet the flame spread and smoke developed requirements '
        'per Section 602.')
    _update_content(conn, bid, '27',
        'Chapter 27 addresses electrical system requirements. HVAC contractors must '
        'coordinate with the electrical contractor for equipment disconnects per NEC '
        'Section 440, control wiring for building automation systems, and emergency '
        'power for required mechanical systems including smoke control and stairwell '
        'pressurization.')
    _update_content(conn, bid, '28',
        'Chapter 28 covers mechanical system requirements from a building code perspective, '
        'referencing IMC and IFGC for specific installation requirements. Section 2802 '
        'requires HVAC systems in high-rise buildings to be designed for smoke control '
        'per Chapter 9. Section 2804 requires seismic bracing of mechanical equipment '
        'per IBC Chapter 16 and ASCE 7.')
    _update_content(conn, bid, '29',
        'Chapter 29 references IPC for plumbing system requirements. HVAC contractors '
        'must coordinate with plumbing contractors on condensate disposal, hydronic '
        'system connections to domestic water, and floor drain requirements in '
        'mechanical rooms. Minimum plumbing fixture counts for occupancy types are '
        'established in IPC Table 403.1.')
    _update_content(conn, bid, '30',
        'Chapter 30 covers elevators and conveying systems per ASME A17.1. HVAC '
        'contractors may need to provide tempered ventilation to elevator machine '
        'rooms and hoistways. Machine rooms and control spaces require minimum '
        'temperature control to protect elevator equipment.')
    _update_content(conn, bid, '31',
        'Chapter 31 covers special construction including membrane structures, '
        'pedestrian walkways, and structures containing hazardous materials. '
        'Special HVAC considerations for membrane structures include positive '
        'pressure inflation systems and emergency deflation provisions.')
    _update_content(conn, bid, '32',
        'Chapter 32 regulates encroachments into public rights-of-way including '
        'overhangs, awnings, and mechanical equipment. HVAC exhaust terminals, '
        'outdoor condensing units, and wall louvers projecting over public '
        'sidewalks require approval from the authority having jurisdiction and '
        'must maintain minimum clearances above grade.')
    _update_content(conn, bid, '33',
        'Chapter 33 establishes safeguards during construction including protection '
        'of adjacent properties, temporary facilities, and means of egress. HVAC '
        'contractors must maintain temporary heat and ventilation for enclosed '
        'occupied spaces during construction and must prevent combustion products '
        'from entering occupied areas during installation and testing.')
    _update_content(conn, bid, '34',
        'Chapter 34 covers alterations, repairs, additions, and changes of occupancy '
        'to existing buildings. HVAC systems in existing buildings being renovated '
        'must be updated to meet current energy code requirements when systems are '
        'replaced, and must be designed to serve the new occupancy classification '
        'when a change of occupancy occurs.')
    _update_content(conn, bid, '35',
        'Chapter 35 lists all standards referenced throughout the IBC. Key standards '
        'affecting mechanical work include NFPA 13 (sprinkler systems), NFPA 72 '
        '(fire alarm), NFPA 90A (air conditioning and ventilating systems), NFPA 96 '
        '(commercial cooking ventilation), ASHRAE 90.1 (energy), and SMACNA duct '
        'construction standards. Compliance with the listed edition of each standard '
        'is mandatory.')

    # ── Depth=1 sections ───────────────────────────────────────────
    for ch_num, secs in [
        ('1', [('101', 'Scope',
                'Section 101 states the IBC applies to the construction, alteration, '
                'relocation, enlargement, replacement, repair, equipment, use, and '
                'occupancy of every building or structure. The IMC and IFGC govern '
                'mechanical and gas systems within those buildings. Section 101.4 '
                'clarifies that the IBC does not apply to detached one- and two-family '
                'dwellings and townhouses covered by the IRC. Mixed-use buildings '
                'must comply with IBC; HVAC contractors must verify which code '
                'governs before submitting permits.'),
               ('104', 'Duties and Powers',
                'Section 104 grants the code official authority to enforce the IBC, '
                'conduct inspections, issue permits and notices of violation, and '
                'require testing. Section 104.11 allows approval of alternative '
                'materials and methods that meet the intent of the code when '
                'substantiated by technical data. HVAC contractors may propose '
                'alternative duct materials, insulation systems, or installation '
                'methods under Section 104.11 with appropriate documentation.'),
               ('105', 'Permits',
                'Section 105 requires permits for construction, alteration, repair, '
                'and change of occupancy. Mechanical permits are separate from '
                'building permits but are part of the same permit process. Section '
                '105.2 lists work exempt from permits, which includes minor '
                'repairs and replacements not affecting structural elements or '
                'fire-resistance ratings. Equipment replacements in commercial '
                'buildings typically require a permit regardless of like-for-like '
                'swap.')]),
        ('2', [('201', 'General',
                'Section 201 defines terms used throughout IBC. FIRE BARRIER is '
                'a fire-resistance-rated wall assembly having protected openings '
                'that restricts the spread of fire. SMOKE BARRIER is a continuous '
                'membrane designed to restrict the movement of smoke. These '
                'distinctions are critical for HVAC contractors: fire barriers '
                'require fire dampers at duct penetrations while smoke barriers '
                'require smoke dampers per Section 717.')]),
        ('3', [('302', 'Occupancy Classification',
                'Section 302 classifies buildings by occupancy group: A (Assembly), '
                'B (Business), E (Educational), F (Factory), H (High Hazard), '
                'I (Institutional), M (Mercantile), R (Residential), S (Storage), '
                'U (Utility). Occupancy determines ventilation rates in IMC '
                'Table 403.3.1.1, sprinkler requirements per Section 903, egress '
                'requirements per Chapter 10, and fire alarm requirements per '
                'Section 907. Mixed-occupancy buildings must be analyzed for each '
                'occupancy type separately unless accessory occupancies qualify.'),
               ('303', 'Assembly Group A',
                'Section 303 defines Assembly occupancies (Group A) as buildings '
                'or spaces used for gatherings of 50 or more persons for civic, '
                'social, religious, recreational, or similar purposes. Subcategories '
                'A-1 through A-5 affect sprinkler requirements and HVAC ventilation '
                'rates. Theaters, restaurants, and places of worship are common '
                'A-occupancies where HVAC contractors frequently work. Design '
                'occupant loads from IBC Table 1004.5 drive ventilation '
                'calculations.'),
               ('308', 'Institutional Group I',
                'Section 308 defines Institutional occupancies where occupants '
                'are cared for or restrained. I-1 (assisted living), I-2 (hospitals, '
                'nursing homes), I-3 (jails), and I-4 (day care) have strict '
                'ventilation, temperature, humidity, and infection control requirements. '
                'I-2 occupancies require a dedicated HVAC design complying with '
                'ASHRAE 170 (Ventilation of Health Care Facilities) which specifies '
                'specific air change rates, filtration levels, and pressure '
                'relationships for patient care spaces.')]),
        ('4', [('402', 'Covered/Open Mall Buildings',
                'Section 402 establishes special requirements for covered mall '
                'buildings. HVAC contractors must provide smoke exhaust or purge '
                'systems for malls over 50,000 sq ft per Section 402.9. Mall '
                'corridors and atrium spaces require smoke control analysis and '
                'systems designed per Section 909 to maintain tenable conditions '
                'during a fire. Coordination with the smoke control engineer '
                'early in the design process is essential.'),
               ('403', 'High-Rise Buildings',
                'Section 403 applies to buildings with occupied floors more than '
                '75 feet above the lowest level of fire department vehicle access. '
                'High-rise buildings require a fire command center per Section '
                '403.4.6, emergency voice communication system, standby power '
                'for HVAC smoke control fans, and stairwell pressurization per '
                'Section 909.20. HVAC contractors working on high-rise projects '
                'must coordinate closely with the fire protection engineer and '
                'building automation system designer.')]),
        ('5', [('503', 'General Height/Area Limits',
                'Section 503 and Table 503 establish the maximum building height '
                'and area based on construction type and occupancy. Type I-A '
                'construction has unlimited height for most occupancies; Type V-B '
                'is the most restrictive. Sprinkler systems allow height increases '
                'of one story and 20 feet and area increases of up to 300% for '
                'single-story buildings per Sections 504 and 506.'),
               ('504', 'Allowable Increases',
                'Section 504 permits height and area increases when automatic '
                'sprinkler systems are provided throughout. One additional story '
                'and 20 feet of height are allowed. Section 506 permits floor '
                'area increases of 200% for multistory and 300% for single-story '
                'sprinklered buildings. These increases affect the size of '
                'mechanical rooms and equipment placement as buildings may be '
                'taller or larger than the base limits allow.')]),
        ('6', [('602', 'Construction Types',
                'Section 602 and Table 601 define five construction types based '
                'on fire resistance. Type I (IA and IB) uses noncombustible '
                'materials; ducts and mechanical equipment in Type I buildings '
                'must use noncombustible or listed materials in most areas. '
                'Type V allows combustible materials throughout. Section 602 '
                'affects which duct materials are permitted in unconditioned '
                'spaces, plenums, and chase enclosures.')]),
        ('7', [('703', 'Fire-Resistance Ratings',
                'Section 703 establishes fire-resistance ratings for building '
                'elements per Table 601. Ratings are determined by testing per '
                'ASTM E119 or UL 263. HVAC penetrations through rated assemblies '
                'must be protected with tested and listed firestopping systems '
                'per Section 714. Fire-resistance-rated shafts enclosing '
                'mechanical ductwork and piping must meet the applicable rating '
                'per Section 713.'),
               ('706', 'Fire Walls',
                'Section 706 covers fire walls — the highest-rated fire separation '
                'that creates independent buildings for code purposes. Fire walls '
                'must extend to and through the roof and be structurally independent. '
                'Ducts penetrating fire walls require fire dampers listed to UL 555 '
                'at every penetration. Fire walls in occupancies involving high-piled '
                'storage or hazardous materials may require 3- or 4-hour ratings.'),
               ('717', 'Fire/Smoke Dampers',
                'Section 717 is critical for HVAC contractors. Fire dampers (UL 555) '
                'are required at all duct penetrations through fire barriers, fire '
                'walls, and shaft enclosures. Smoke dampers (UL 555S) are required '
                'at penetrations through smoke barriers and smoke partitions, and '
                'where required for smoke control systems. Fire/smoke combination '
                'dampers (UL 555 and 555S) serve both functions. Access doors at '
                'least 12 × 12 inches are required within 18 inches of each damper '
                'per Section 717.3.3. Annual damper testing is required by NFPA 80 '
                'and NFPA 105.')]),
        ('8', [('803', 'Interior Wall/Ceiling Finish',
                'Section 803 and Table 803.13 limit flame spread index (FSI) '
                'and smoke developed index (SDI) of interior finish materials '
                'by occupancy. Class A finish (FSI 0-25, SDI 0-450) is required '
                'in egress corridors, exit enclosures, and high-risk occupancies. '
                'Duct liner and duct insulation installed inside the air stream '
                'must meet IMC Section 603 material requirements which also '
                'reference ASTM E84 flame spread limits.')]),
        ('9', [('903', 'Automatic Sprinkler Systems',
                'Section 903 requires automatic sprinkler systems in specific '
                'occupancies and above threshold areas. Section 903.2 lists '
                'mandatory sprinkler locations by occupancy group. All sprinkler '
                'systems must be NFPA 13 systems (or NFPA 13R/13D for residential). '
                'HVAC contractors must ensure that ceiling-mounted ductwork, '
                'diffusers, and light fixtures do not obstruct sprinkler coverage '
                'per NFPA 13 clearance requirements.'),
               ('907', 'Fire Alarm Systems',
                'Section 907 requires fire alarm systems based on occupancy and '
                'building size. Duct smoke detectors per Section 606 must '
                'interface with the building fire alarm system. Smoke detector '
                'activation must initiate HVAC shutdown per Section 907.2.1. '
                'HVAC contractors must provide conduit and junction boxes for '
                'duct detector wiring and coordinate with the fire alarm '
                'contractor on interlocks.'),
               ('909', 'Smoke Control',
                'Section 909 governs smoke control systems required in atriums, '
                'underground buildings, high-rise buildings, and other special '
                'occupancies. Smoke control may be achieved through pressurization, '
                'exhaust, or airflow. Section 909.18 requires commissioning of '
                'smoke control systems including integrated testing with the fire '
                'alarm system. HVAC contractors providing fans, dampers, and '
                'controls for smoke control must coordinate with the smoke '
                'control engineer throughout design and construction.')]),
        ('10', [('1004', 'Occupant Load',
                 'Section 1004 and Table 1004.5 establish maximum occupant loads '
                 'for various use categories. Occupant load drives ventilation '
                 'rates per IMC Table 403.3.1.1 and determines the minimum number '
                 'of plumbing fixtures. Office space is calculated at 100 sq ft '
                 'per occupant; assembly standing space at 5 sq ft per occupant. '
                 'HVAC designers must use these occupant loads for ventilation '
                 'and cooling load calculations.'),
                ('1005', 'Egress Width',
                 'Section 1005 requires minimum egress widths of 0.3 inches per '
                 'occupant for stairways and 0.2 inches per occupant for other '
                 'egress components, with absolute minimums of 44 inches for '
                 'corridors serving more than 50 occupants. HVAC equipment, '
                 'pipes, and ductwork must not encroach on required egress widths '
                 'in corridors and mechanical rooms used as egress paths.'),
                ('1010', 'Doors/Gates',
                 'Section 1010 requires exit doors to have a minimum 32-inch '
                 'clear width and be operable with a single motion using one '
                 'hand without tight grasping. Assembly spaces with more than '
                 '50 occupants require panic hardware (push bar). Mechanical '
                 'room exit doors must comply — rooms containing large equipment '
                 'may qualify as occupiable spaces requiring compliant door '
                 'hardware.')]),
        ('11', [('1103', 'Scoping',
                 'Section 1103 requires accessibility per ICC A117.1 for all '
                 'buildings except detached dwellings. Thermostats, HVAC controls, '
                 'and mechanical room panels must be mounted at accessible heights '
                 'per ICC A117.1 Section 309: operable parts between 15 and 48 '
                 'inches (side reach) or 15 and 48 inches (forward reach with '
                 'obstruction ≤20 inches deep). HVAC contractors should verify '
                 'thermostat mounting heights during rough-in.'),
                ('1107', 'Dwelling Units',
                 'Section 1107 requires a percentage of dwelling units in '
                 'multifamily buildings to be Type A (fully accessible) and '
                 'Type B (adaptable) per Table 1107.6. HVAC equipment serving '
                 'these units must be accessible per ICC A117.1 — controls '
                 'at accessible heights, clearances for wheelchair approach, '
                 'and accessible service access to equipment.')]),
        ('12', [('1202', 'Ventilation',
                 'Section 1202 requires all occupied spaces to be ventilated '
                 'by natural or mechanical means. Natural ventilation requires '
                 'openable exterior openings with net free area of at least '
                 '4% of floor area. Mechanical ventilation must comply with '
                 'the IMC, which specifies minimum outdoor air rates per '
                 'Table 403.3.1.1. Bathrooms, kitchens, and other spaces '
                 'producing moisture or odors require exhaust ventilation.'),
                ('1203', 'Temperature Control',
                 'Section 1203.1 requires occupied portions of all buildings '
                 'to be provided with heating capable of maintaining a minimum '
                 'indoor temperature of 68°F at 3.5 feet above floor level. '
                 'Areas not normally occupied (storage, mechanical rooms) are '
                 'exempt. The code does not require cooling, but mechanical '
                 'cooling systems must comply with IECC efficiency requirements '
                 'when provided.'),
                ('1204', 'Lighting',
                 'Section 1204 requires natural or artificial lighting in all '
                 'occupied spaces. Minimum 10 foot-candles at floor level for '
                 'most spaces. HVAC contractors must coordinate equipment '
                 'placement with lighting layouts to avoid obstructing required '
                 'light levels. Mechanical rooms require minimum 30 foot-candles '
                 'at the working plane per NFPA 70 (NEC).'),
                ('1205', 'Sound Transmission',
                 'Section 1205 requires sound transmission class (STC) ratings '
                 'of at least 50 for wall and floor-ceiling assemblies between '
                 'dwelling units. HVAC equipment noise transmission through '
                 'structural paths, ductwork, and piping must be controlled '
                 'with vibration isolation, flexible connectors, and acoustical '
                 'duct liner. Section 1205.3 addresses impact insulation class '
                 '(IIC) requirements for floor-ceiling assemblies.'),
                ('1207', 'Plumbing Fixtures',
                 'Section 1207 requires minimum plumbing fixture counts per '
                 'IPC Table 403.1 based on occupancy type and occupant load. '
                 'HVAC mechanical rooms must include a floor drain where water '
                 'heaters, boilers, cooling coils, or hydronic equipment are '
                 'located. Accessible fixtures must be provided per Section '
                 '1109.')]),
        ('13', [('1301', 'Energy Efficiency',
                 'Section 1301 requires commercial buildings to comply with '
                 'the IECC Commercial provisions or ASHRAE 90.1. Residential '
                 'buildings under IBC jurisdiction (4+ stories) must comply '
                 'with IECC Commercial. Equipment schedules on construction '
                 'documents must show certified efficiency ratings (AHRI '
                 'certified data sheets or equivalent). Section 1301.1.1 '
                 'permits compliance via COMcheck energy compliance software '
                 'or equivalent energy modeling.')]),
        ('14', [('1403', 'Performance Requirements',
                 'Section 1403 requires exterior walls to resist wind pressure, '
                 'be watertight, and prevent moisture from entering the building. '
                 'Water-resistive barriers behind cladding are required per '
                 'Section 1403.2. HVAC penetrations through exterior walls must '
                 'be properly flashed and sealed. Section 1403.3 requires '
                 'flashing at all wall openings, including louvers, grilles, '
                 'and equipment penetrations.')]),
        ('15', [('1504', 'Roof Materials',
                 'Section 1504 and Table 1505.1 specify fire classification '
                 'requirements for roof coverings (Class A, B, or C) based '
                 'on construction type and occupancy. Rooftop HVAC equipment '
                 'must be mounted on listed equipment curbs that maintain the '
                 'roof assembly\'s fire classification and waterproofing. '
                 'Section 1504.1 requires roof coverings to resist the local '
                 'design wind speed from Table 1609.3.')]),
        ('16', [('1603', 'Design Loads',
                 'Section 1603 requires construction documents to show all '
                 'design loads per ASCE 7. Oklahoma design parameters: Risk '
                 'Category II wind speed 115-130 mph (varies by location), '
                 'seismic Ss ranges from 0.1g to 0.6g across the state. HVAC '
                 'contractors must provide equipment weights and locations to '
                 'the structural engineer of record for roof and wall load '
                 'calculations.'),
                ('1607', 'Live Loads',
                 'Table 1607.1 specifies minimum floor live loads: residential '
                 '40 psf, office 50 psf, mechanical rooms 125 psf minimum '
                 '(equipment weight governs). Rooftop mechanical equipment '
                 'loads must be provided to the structural engineer. Heavy '
                 'equipment such as rooftop air handlers and cooling towers '
                 'often require structural reinforcement of the roof framing.')]),
        ('17', [('1705', 'Structural Inspections',
                 'Section 1705 lists work requiring special inspections including '
                 'structural steel connections, concrete placement, masonry, '
                 'and in seismic design categories C and above, mechanical '
                 'equipment anchorage. HVAC equipment seismic bracing may '
                 'require inspection by a special inspector when the project '
                 'falls in SDC C or higher. Oklahoma City is generally SDC B; '
                 'Tulsa area varies by soil type.')]),
        ('18', [('1803', 'Geotechnical Investigations',
                 'Section 1803 requires geotechnical investigations for sites '
                 'with problematic soils. Oklahoma\'s expansive clay soils '
                 '(especially in central and western Oklahoma) can cause '
                 'differential foundation movement. Underground HVAC piping '
                 'in expansive soil areas should be sleeved or have flexible '
                 'connections to accommodate movement. The geotechnical report '
                 'should be reviewed before designing underground mechanical systems.')]),
        ('19', [('1903', 'Specifications',
                 'Section 1903 requires concrete to comply with ACI 318 with '
                 'minimum specified compressive strength per the design. HVAC '
                 'contractors core-drilling or cutting concrete for pipe and '
                 'duct penetrations must avoid cutting reinforcing steel without '
                 'engineer approval. Minimum concrete cover for embedded '
                 'conduit is 1.5 inches; for mechanical sleeves it must maintain '
                 'the same clearance as reinforcing bars.')]),
        ('20', [('2002', 'Materials',
                 'Section 2002 specifies aluminum structural members must comply '
                 'with AA ADM1. Aluminum HVAC components (coils, air handlers, '
                 'duct fittings) used in structural applications must be designed '
                 'per the Aluminum Design Manual. Aluminum is susceptible to '
                 'galvanic corrosion when in contact with steel, copper, or '
                 'concrete — dielectric separation or coatings are required.')]),
        ('21', [('2103', 'Masonry Construction',
                 'Section 2103 requires masonry to comply with TMS 402/602. '
                 'HVAC contractors cutting through masonry walls must use core '
                 'drills (not jackhammers) on grouted masonry and must lintel '
                 'all openings wider than 6 inches. Masonry penetrations for '
                 'ductwork larger than 18 inches typically require structural '
                 'engineer review and custom lintels.')]),
        ('22', [('2205', 'Steel Construction',
                 'Section 2205 requires structural steel to comply with AISC '
                 '360. HVAC contractors must not cut, torch, or weld structural '
                 'steel members without specific approval from the structural '
                 'engineer of record. Attachment of equipment supports to '
                 'structural steel by welding requires special inspection and '
                 'the welder must be certified per AWS D1.1.')]),
        ('23', [('2303', 'Wood Construction',
                 'Section 2303 requires lumber and engineered wood to comply '
                 'with applicable grading standards. Drilling through wood '
                 'structural members for HVAC ductwork and piping must comply '
                 'with notching and boring limits in Section 2308: holes in '
                 'joists shall not exceed 1/3 the depth, shall be at least '
                 '2 inches from the top or bottom edge, and shall not be in '
                 'the middle third of the span.')]),
        ('24', [('2403', 'Safety Glazing',
                 'Section 2403 requires safety glazing (tempered, laminated, '
                 'or wire glass) at hazardous locations including near doors, '
                 'large glazed openings, and wet areas. HVAC contractors '
                 'installing wall louvers or grilles in glazed curtain walls '
                 'must coordinate locations to avoid compromising required '
                 'safety glazing locations.')]),
        ('25', [('2503', 'Gypsum Board',
                 'Section 2503 requires gypsum board assemblies to comply with '
                 'ASTM C840 and GA-216 installation standards. Mechanical '
                 'penetrations through gypsum shaft walls, fire barriers, and '
                 'rated partitions must be protected with tested firestop '
                 'systems per Section 714. Annular spaces around ductwork '
                 'and piping must not exceed the tested firestop system limits '
                 '(typically 1 inch maximum annular space).')]),
        ('26', [('2603', 'Foam Plastic',
                 'Section 2603 requires foam plastic insulation to be separated '
                 'from the building interior by a thermal barrier of at least '
                 '1/2-inch gypsum board. Foam plastic on ductwork and piping '
                 'installed in unconditioned spaces is regulated by the IMC; '
                 'foam in plenums must meet IMC Section 602 requirements for '
                 'plenum materials with FSI ≤25 and SDI ≤50.')]),
        ('27', [('2701', 'Electrical',
                 'Section 2701 requires all electrical systems to comply with '
                 'the NEC (NFPA 70). HVAC equipment disconnects must be within '
                 'sight of the equipment per NEC Section 440.14. Equipment '
                 'nameplate data must match electrical circuit sizing. Control '
                 'wiring for building automation and energy management systems '
                 'must be installed in appropriate raceways per NEC Section '
                 '725.')]),
        ('28', [('2801', 'General',
                 'Section 2801 establishes that mechanical systems in buildings '
                 'subject to the IBC must comply with the IMC (or IRC for '
                 'residential). Section 2801.2 requires mechanical systems '
                 'in high-rise buildings to include smoke control provisions '
                 'per Section 909. All mechanical systems must be designed '
                 'by a registered mechanical engineer for projects requiring '
                 'design professionals per Section 107.'),
                ('2802', 'HVAC Systems',
                 'Section 2802 requires HVAC systems in high-rise buildings '
                 'and buildings with atriums to be designed for smoke control '
                 'per Section 909 and IMC Chapter 5. Stairwell pressurization '
                 'systems per Section 909.20 must maintain positive pressure '
                 'differential of 0.05 inches WC (12.5 Pa) relative to adjacent '
                 'spaces when doors are closed. HVAC contractors must provide '
                 'dedicated pressurization fans with backup power.'),
                ('2803', 'Elevators/Conveyors',
                 'Section 2803 requires elevator machine rooms to be ventilated '
                 'to maintain equipment operating temperatures per the elevator '
                 'manufacturer\'s requirements, typically 50-95°F. Machine '
                 'room temperature control must be separate from the building '
                 'HVAC system. Hoistways require ventilation openings of at '
                 'least 3.5% of hoistway cross-section area at the top.'),
                ('2804', 'Seismic Bracing',
                 'Section 2804 requires mechanical systems to be braced for '
                 'seismic loads per IBC Chapter 16 and ASCE 7 Chapter 13. '
                 'Mechanical equipment weighing over 400 lb, ducts over 6 '
                 'inches diameter, and piping over 2.5-inch diameter require '
                 'seismic bracing per SMACNA Seismic Restraint Manual or '
                 'ASHRAE Handbook guidelines.'),
                ('2805', 'Emergency Systems',
                 'Section 2805 requires emergency mechanical systems including '
                 'stairwell pressurization, smoke exhaust, and emergency '
                 'ventilation to be connected to standby power per IBC Section '
                 '2702. Standby power must be capable of 60 minutes of '
                 'operation for smoke control systems. Emergency systems must '
                 'be tested per Section 909.18.8 before final approval.')]),
        ('29', [('2901', 'Plumbing Systems',
                 'Section 2901 requires all plumbing systems to comply with '
                 'the IPC or IRC. HVAC contractors installing condensate drains, '
                 'hydronic system fill connections, and boiler blowdown drains '
                 'must coordinate with the plumbing contractor to ensure '
                 'indirect waste connections and air gaps are provided per '
                 'IPC Section 802.'),
                ('2902', 'Minimum Fixtures',
                 'Section 2902 requires minimum plumbing fixtures per IPC '
                 'Table 403.1 based on occupancy and occupant load. Mechanical '
                 'rooms with water-using equipment (boilers, cooling towers, '
                 'water heaters) must include a floor drain connected to the '
                 'sanitary system. Emergency eyewash stations are required in '
                 'chemical treatment rooms per ANSI Z358.1.')]),
        ('30', [('3001', 'Elevators',
                 'Section 3001 requires elevators to comply with ASME A17.1. '
                 'HVAC contractors must provide climate-controlled machine '
                 'rooms maintaining temperatures between 50°F and 95°F year-round. '
                 'Machine room HVAC must not use the main building system — '
                 'a dedicated split system or precision cooling unit is '
                 'typically required. Machine room openings must be self-closing '
                 'and self-latching.')]),
        ('31', [('3102', 'Membrane Structures',
                 'Section 3102 covers air-supported, air-inflated, and tensioned '
                 'membrane structures. Air-supported structures require inflation '
                 'blowers with backup power and pressure monitoring systems. '
                 'HVAC systems for membrane structures must account for the '
                 'structure\'s lower thermal mass and greater infiltration '
                 'compared to conventional construction.')]),
        ('32', [('3201', 'Encroachments',
                 'Section 3201 regulates projections into public rights-of-way. '
                 'HVAC exhaust grilles, combustion air intakes, and condensing '
                 'unit placement must not encroach into public rights-of-way '
                 'without specific permits. Louvers on building facades must '
                 'maintain minimum heights above grade per local ordinances '
                 'and AHJ requirements.')]),
        ('33', [('3303', 'Demolition',
                 'Section 3303 requires demolition plans for removing existing '
                 'structures. HVAC contractors removing existing mechanical '
                 'systems must ensure proper refrigerant recovery per EPA '
                 'Section 608, asbestos abatement of existing duct insulation '
                 'or equipment if applicable, and safe disconnection of gas '
                 'lines with utility coordination.')]),
        ('34', [('3401', 'Existing Buildings',
                 'Section 3401 establishes that additions and alterations to '
                 'existing buildings must comply with current code requirements '
                 'for the new work. When HVAC systems are replaced, new equipment '
                 'must meet current IECC efficiency requirements. Change of '
                 'occupancy may require complete HVAC system redesign to meet '
                 'ventilation and temperature requirements of the new occupancy '
                 'type.')]),
        ('35', [('3501', 'Referenced Standards',
                 'Chapter 35 includes all enforceable referenced standards: '
                 'NFPA 13 (sprinkler systems), NFPA 72 (fire alarm), NFPA 90A '
                 '(HVAC systems), NFPA 96 (commercial cooking ventilation), '
                 'ASHRAE 90.1 (energy), ASHRAE 62.1 (ventilation), SMACNA '
                 'duct construction standards, ACCA Manual J/D/S, and AHRI '
                 'equipment rating standards. The specific edition of each '
                 'standard listed in Chapter 35 is the enforceable version.')]),
    ]:
        pid = _ch(conn, bid, ch_num)
        if pid:
            _ins(conn, bid, pid, secs)

# ── IRC (International Residential Code 2021) ────────────────────

def _seed_irc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'Chapter 1 establishes the scope and administrative requirements of the IRC, '
        'which applies to detached one- and two-family dwellings and townhouses three '
        'stories or less. Mechanical permits are required for HVAC installation, replacement, '
        'and alteration. The IRC covers building, plumbing, mechanical, fuel gas, energy, '
        'and electrical provisions in a single document.')
    _update_content(conn, bid, '2',
        'Chapter 2 provides definitions for residential construction terms. Key definitions '
        'for HVAC work include CONDITIONED SPACE, HABITABLE SPACE, ATTIC, CRAWL SPACE, '
        'MECHANICAL SYSTEM, and VENTILATION. These definitions determine which spaces '
        'require HVAC service and what minimum conditions must be maintained.')
    _update_content(conn, bid, '3',
        'Chapter 3 covers building planning requirements including fire-resistant construction '
        'for dwelling unit separations, light and ventilation requirements, emergency escape '
        'openings, and sound transmission. Section R303 requires habitable rooms to have '
        'natural light and ventilation or mechanical equivalents. HVAC contractors must '
        'ensure mechanical ventilation systems comply with Section R303 minimums.')
    _update_content(conn, bid, '4',
        'Chapter 4 covers residential foundation requirements. HVAC contractors routing '
        'gas piping, duct systems, or refrigerant lines through or under foundations must '
        'coordinate penetrations with the foundation design. Oklahoma\'s expansive clay '
        'soils require special attention to underground piping flexibility and sleeve design.')
    _update_content(conn, bid, '5',
        'Chapter 5 covers floor construction. HVAC contractors drilling through floor '
        'joists for ductwork and piping are limited to holes not exceeding 1/3 of the '
        'joist depth per Section R502.8. Supply and return air registers in floors '
        'are common in Oklahoma residential construction and must have smooth, '
        'cleanable metal duct connections.')
    _update_content(conn, bid, '6',
        'Chapter 6 covers wall construction. HVAC contractors must limit notches in '
        'wall studs to 25% of stud width for bearing walls and 40% for non-bearing '
        'walls per Section R602.6. Supply air and return air grilles mounted in '
        'walls must have proper backing, and mini-split line-set penetrations '
        'must be sealed against air infiltration and fire spread.')
    _update_content(conn, bid, '7',
        'Chapter 7 covers exterior wall covering and weather resistance. HVAC '
        'penetrations through exterior walls for line sets, flue pipes, combustion '
        'air intakes, and exhaust vents must be properly flashed and sealed against '
        'water intrusion per Section R703. Through-wall exhaust fans and PTAC units '
        'require proper weather-resistant installation.')
    _update_content(conn, bid, '8',
        'Chapter 8 covers roof-ceiling construction. Attic access openings must be '
        'minimum 22 × 30 inches per Section R807.1. Attic-installed HVAC equipment '
        'requires a permanent 24-inch-wide walkway from the access opening to each '
        'piece of equipment per Section M1305.1.3. Attic ventilation per Section '
        'R806 must not be blocked by insulation or equipment placement.')
    _update_content(conn, bid, '9',
        'Chapter 9 covers residential roof assembly materials and construction. '
        'Rooftop HVAC equipment on low-slope residential roofs must be mounted on '
        'listed curbs maintaining the roof membrane integrity. Condensate from '
        'rooftop equipment must drain to approved locations and not onto '
        'adjacent properties or public sidewalks.')
    _update_content(conn, bid, '10',
        'Chapter 10 covers residential chimneys and fireplaces. HVAC contractors '
        'must properly size gas appliance vents relative to existing masonry '
        'chimneys. When adding a gas appliance to an existing masonry chimney, '
        'a flexible stainless steel liner (Category I) sized per the vent tables '
        'must typically be installed inside the masonry flue.')
    _update_content(conn, bid, '11',
        'Chapter 11 covers residential energy efficiency and references IECC '
        'Residential provisions. Oklahoma is Climate Zone 3A requiring ceiling '
        'R-38+, wall R-20 or R-13+5ci, and HVAC equipment meeting minimum '
        'efficiency (15 SEER2/8.1 HSPF2 for heat pumps, 14.3 SEER2 for AC, '
        '80% AFUE for furnaces). Duct leakage testing to ≤4 CFM25/100 sq ft '
        'and blower door testing ≤5 ACH50 are required.')
    _update_content(conn, bid, '12',
        'Chapter 12 covers mechanical administration provisions for residential '
        'buildings including permit requirements, inspection stages, and the '
        'authority of the code official. Mechanical permits are required before '
        'installing or replacing HVAC systems. A final mechanical inspection '
        'must be passed before the certificate of occupancy is issued.')
    _update_content(conn, bid, '13',
        'Chapter 13 covers general mechanical system requirements applicable to '
        'all residential mechanical systems. Section M1301 requires mechanical '
        'systems to be designed and installed per manufacturer instructions and '
        'the IRC. Equipment must be listed and labeled. Clearances to combustibles '
        'per the listing must be maintained.')
    _update_content(conn, bid, '14',
        'Chapter 14 covers heating and cooling equipment and appliances including '
        'furnaces, boilers, heat pumps, air conditioners, room air conditioners, '
        'and evaporative coolers. Section M1401 requires equipment to be properly '
        'sized per ACCA Manual J load calculations. Section M1411 addresses '
        'refrigerant containment and EPA Section 608 requirements for residential '
        'HVAC systems.')
    _update_content(conn, bid, '15',
        'Chapter 15 covers residential exhaust systems including bathroom exhaust, '
        'kitchen range hood exhaust, clothes dryer exhaust, and whole-house '
        'ventilation exhaust. Section M1505 limits dryer exhaust duct length to '
        '35 feet (reduced for elbows). Section M1503 covers range hood requirements '
        'including recirculating type with charcoal filters and ducted-to-outside '
        'type duct sizing.')
    _update_content(conn, bid, '16',
        'Chapter 16 covers residential duct systems including construction, '
        'installation, insulation, and sealing. Section M1601 requires ducts to '
        'be constructed per SMACNA or ACCA standards. All duct joints must be '
        'sealed with mastic or listed tape. Flexible duct is limited to 5-foot '
        'maximum lengths per connection. Duct insulation requirements per IECC '
        'Section R403.3 must be met for unconditioned space runs.')
    _update_content(conn, bid, '17',
        'Chapter 17 covers combustion air requirements for fuel-burning residential '
        'appliances. Section M1702 uses the same indoor air and outdoor air methods '
        'as IMC Chapter 7 and IFGC Chapter 3. Modern tight residential construction '
        'typically requires outdoor combustion air for non-direct-vent appliances. '
        'Many Oklahoma HVAC contractors default to direct-vent sealed-combustion '
        'equipment to avoid combustion air calculations in tight homes.')
    _update_content(conn, bid, '18',
        'Chapter 18 covers residential chimneys and vents. Type B vent sizing '
        'tables in Appendix B of the IFGC are used for residential gas appliance '
        'venting. PVC and CPVC pipe may be used for Category IV condensing '
        'appliance venting. Section M1801 requires all vents to be gas-tight '
        'and slope upward to the vent terminal.')
    _update_content(conn, bid, '19',
        'Chapter 19 covers specific residential appliances not addressed in other '
        'chapters including room heaters, fireplace inserts, decorative appliances, '
        'and solid fuel-burning equipment. Wood-burning stoves and fireplace inserts '
        'must be EPA-certified. Pellet stoves may use Type L vent or pellet vent '
        'as specified by the appliance listing.')
    _update_content(conn, bid, '20',
        'Chapter 20 covers residential boilers and water heaters. Section M2001 '
        'requires boilers to comply with ASME Section IV and have T&P relief '
        'valves, low-water cutoffs for steam boilers, and automatic operating '
        'controls. Section M2005 covers water heaters and requires T&P relief '
        'valves with discharge piping terminating at safe locations per '
        'Section M2204.')
    _update_content(conn, bid, '21',
        'Chapter 21 covers residential hydronic piping systems. Section M2101 '
        'requires hydronic systems to be pressure tested at 1.5 times working '
        'pressure minimum. Expansion tanks must accommodate system volume change. '
        'Air separators and purge valves are required for proper system operation. '
        'PEX tubing per ASTM F876 is commonly used for residential hydronic '
        'systems including radiant floor heating.')
    _update_content(conn, bid, '22',
        'Chapter 22 covers special piping and storage systems for liquefied '
        'petroleum gas (LP-gas) storage. LP-gas tanks must comply with NFPA 58 '
        'for container sizing, setback distances, and installation. Containers '
        'over 125 gallons water capacity require specific installation clearances '
        'from structures, property lines, and ignition sources.')
    _update_content(conn, bid, '23',
        'Chapter 23 covers residential solar thermal energy systems. Systems '
        'must be installed per manufacturer listing. Freeze protection is required '
        'using drainback systems or propylene glycol antifreeze. Heat exchangers '
        'must prevent cross-contamination of potable water. Solar thermal systems '
        'contribute to IECC energy compliance as an on-site renewable energy source.')
    _update_content(conn, bid, '24',
        'Chapter 24 covers fuel gas systems in one- and two-family dwellings, '
        'referencing IFGC requirements. Gas piping must be pressure tested before '
        'concealment. CSST must be bonded. Sediment traps are required upstream '
        'of each appliance. Appliance connectors are limited to 6 feet. Chapter '
        '24 is commonly used by residential HVAC contractors for all gas work.')
    _update_content(conn, bid, '25',
        'Chapter 25 covers plumbing administration for the IRC plumbing chapters '
        '(25-33). Plumbing permits are separate from mechanical permits. The authority '
        'of the code official to inspect and require testing of plumbing systems '
        'is established here. HVAC contractors must coordinate condensate disposal '
        'connections with the plumbing permit.')
    _update_content(conn, bid, '26',
        'Chapter 26 covers general residential plumbing requirements including '
        'materials, protection from damage, and testing. HVAC condensate drains '
        'connect to the drainage system as indirect waste per IPC Section 802. '
        'The condensate drain must discharge through an air gap to an approved '
        'location — not directly into a drain without an air gap.')
    _update_content(conn, bid, '27',
        'Chapter 27 covers residential plumbing fixtures and their installation '
        'requirements. HVAC contractors installing water-source heat pumps or '
        'ground-source systems must coordinate with plumbing for water supply '
        'and drain connections. Humidifier supply connections must include '
        'backflow prevention per Section P2902.')
    _update_content(conn, bid, '28',
        'Chapter 28 covers residential water heater installation. Gas water '
        'heaters must be vented per the IFGC and IRC Chapter 18. T&P relief '
        'valves are required. Electric water heaters require a dedicated 240V '
        'circuit. Tankless water heaters have specific gas supply sizing '
        'requirements due to high instantaneous Btu/hr demands.')
    _update_content(conn, bid, '29',
        'Chapter 29 covers residential water supply and distribution. HVAC '
        'humidifiers, water-cooled condensers, and ice makers require potable '
        'water connections with backflow prevention. Pipe sizing must account '
        'for all connected fixtures and appliances at simultaneous demand conditions.')
    _update_content(conn, bid, '30',
        'Chapter 30 covers residential sanitary drainage system design and '
        'installation. HVAC condensate drains connect to the sanitary drainage '
        'system as indirect waste. Drain line sizing, slope requirements (1/4 '
        'inch per foot minimum), and trap requirements per Section P3201 apply '
        'to condensate drain connections.')
    _update_content(conn, bid, '31',
        'Chapter 31 covers residential vent systems for sanitary drainage. HVAC '
        'condensate drain connections to the drainage system may require a vent '
        'depending on the connection point and drain line configuration. Proper '
        'venting prevents siphoning of trap seals in condensate drain lines.')
    _update_content(conn, bid, '32',
        'Chapter 32 covers residential plumbing traps. Condensate drain pans '
        'and trap primers — required on negative-pressure (draw-through) cooling '
        'coil drain pans — must be properly trapped to prevent sewer gas from '
        'entering the air handling unit through the condensate drain. Section '
        'P3201 specifies trap depth and sizing requirements.')
    _update_content(conn, bid, '33',
        'Chapter 33 covers residential storm drainage systems. HVAC condensate '
        'may be directed to storm drainage if allowed by local jurisdiction. '
        'Many municipalities require condensate to be directed to the sanitary '
        'sewer or to landscaping areas rather than storm drainage due to '
        'algaecide and chemical treatment concerns.')
    _update_content(conn, bid, '34',
        'Chapter 34 covers general residential electrical requirements, referencing '
        'the NEC. HVAC electrical disconnects must be within sight of the equipment '
        'per NEC Section 440.14. Service entrance capacity must accommodate HVAC '
        'loads. Heat pump and electric furnace loads are significant contributors '
        'to residential electrical service sizing.')
    _update_content(conn, bid, '35',
        'Chapter 35 provides residential electrical definitions including APPLIANCE, '
        'BRANCH CIRCUIT, FEEDER, GROUNDED CONDUCTOR, GROUNDING ELECTRODE, and '
        'LISTED. HVAC equipment must be listed by an approved testing agency. '
        'Equipment ampacity ratings on the nameplate must match the branch circuit '
        'overcurrent protection sizing.')
    _update_content(conn, bid, '36',
        'Chapter 36 covers residential electrical service entrance requirements. '
        'HVAC contractors should verify available utility voltage and service '
        'capacity before specifying equipment. 240V single-phase service is '
        'standard for residential. Three-phase service is available in some '
        'areas for large residential HVAC installations.')
    _update_content(conn, bid, '37',
        'Chapter 37 covers residential branch circuit and feeder requirements '
        'per NEC Articles 210 and 220. HVAC equipment requires dedicated branch '
        'circuits sized per nameplate ampacity with minimum circuit ampacity '
        '(MCA) and maximum overcurrent protection (MOCP) per the equipment label. '
        'Electric heat and heat pump equipment have specific sizing rules per '
        'NEC Section 440.')
    _update_content(conn, bid, '38',
        'Chapter 38 covers residential wiring methods per NEC Article 300. '
        'HVAC control wiring (24V) may be installed in the same raceway as '
        'power wiring only if rated for the highest voltage present, or in '
        'separate raceways. Low-voltage thermostat wiring may be run without '
        'conduit in concealed locations per NEC Section 725.')
    _update_content(conn, bid, '39',
        'Chapter 39 covers residential power and lighting distribution. HVAC '
        'equipment located in attics and crawl spaces requires a dedicated '
        'lighting outlet and switch at the access point per NEC Section 210.70. '
        'Receptacle outlets are required in attics and crawl spaces containing '
        'equipment to allow for portable tools and test equipment during service.')
    _update_content(conn, bid, '40',
        'Chapter 40 covers residential devices and luminaires. HVAC control '
        'panels, thermostat bases, and equipment controls are classified as '
        'devices under NEC definitions. All electrical devices must be listed '
        'and installed in approved enclosures. Thermostat wiring connections '
        'must be made in listed junction boxes or equipment terminals.')
    _update_content(conn, bid, '41',
        'Chapter 41 covers residential appliance installation requirements per '
        'NEC Article 422. HVAC equipment is classified as an appliance under '
        'the NEC. Branch circuit sizing, overcurrent protection, and disconnect '
        'requirements per NEC Articles 440 and 422 apply to all HVAC appliances. '
        'HVAC equipment labels specify MCA and MOCP values for electrical sizing.')
    _update_content(conn, bid, '42',
        'Chapter 42 covers residential swimming pool electrical requirements. '
        'HVAC contractors installing pool heaters must coordinate with the '
        'electrical contractor for proper bonding of pool heater equipment '
        'per NEC Section 680.26. Pool heat pump equipment requires GFCI '
        'protection per NEC Section 680.9.')
    _update_content(conn, bid, '43',
        'Chapter 43 covers Class 2 remote-control, signaling, and power-limited '
        'circuits. Most HVAC control wiring (24V thermostat wiring, DDC control '
        'wiring) operates as Class 2 circuits per NEC Article 725. Class 2 '
        'conductors have relaxed installation requirements compared to power '
        'wiring but must be separated from power conductors in separate raceways '
        'or listed multi-conductor cables.')
    _update_content(conn, bid, '44',
        'Chapter 44 lists all standards referenced in the IRC. Key standards '
        'for HVAC work include IFGC, IMC, ACCA Manual J/D/S, ASHRAE 62.2, '
        'AHRI 210/240, ASTM F876/F877 (PEX tubing), NFPA 54 (NFGC), NFPA 58 '
        '(LP-gas), and NEC (NFPA 70). Compliance with the listed edition of '
        'each standard is required.')

    # ── Depth=1 sections ───────────────────────────────────────────
    for ch, secs in [
        ('1', [('R101', 'Scope',
                'Section R101 states the IRC applies to detached one- and two-family '
                'dwellings and townhouses not more than three stories above grade plane '
                'in height with a separate means of egress. Buildings that exceed these '
                'parameters must be designed per the IBC. Section R101.2 lists the '
                'six subject areas covered: building, plumbing, mechanical, fuel gas, '
                'energy efficiency, and electrical provisions. HVAC contractors on '
                'residential projects must reference the mechanical and fuel gas '
                'chapters (M and G prefixes) as the primary regulatory sections.'),
               ('R105', 'Permits',
                'Section R105 requires permits for the construction, alteration, '
                'movement, enlargement, replacement, repair, equipment, use and '
                'occupancy, location, removal, and demolition of any dwelling. '
                'Mechanical permits are required for HVAC system installation or '
                'replacement. Section R105.2 lists exempt work including portable '
                'heating and cooling appliances, replacement of listed equipment '
                'components without capacity change, and routine maintenance. '
                'Equipment replacement that changes fuel type or capacity always '
                'requires a permit.')]),
        ('2', [('R201', 'General',
                'Section R201 provides definitions for residential construction '
                'terms. CONDITIONED SPACE is space that is directly or indirectly '
                'heated or cooled. HABITABLE SPACE is space for living, sleeping, '
                'eating, or cooking — excludes bathrooms, closets, and utility '
                'rooms. Understanding these definitions affects ventilation '
                'requirements (habitable spaces need ventilation per R303), '
                'insulation requirements (conditioned spaces define the thermal '
                'envelope), and permit exemption determinations.')]),
        ('3', [('R302', 'Fire-Resistant Construction',
                'Section R302 and Table R302.1 specify fire-resistance requirements '
                'for exterior walls, projections, and openings based on fire '
                'separation distance. Dwelling unit separation walls between '
                'attached units must have minimum 1-hour rating or comply with '
                'Table R302.3. Garage separation from living space requires '
                '1/2-inch gypsum board on the garage side and a 20-minute '
                'fire-rated door. HVAC ductwork penetrating these separations '
                'requires fire dampers at the penetration point.'),
               ('R303', 'Light/Ventilation',
                'Section R303.1 requires habitable rooms to have natural light '
                'through glazed openings equal to 8% of floor area or artificial '
                'light. Section R303.1 requires natural ventilation through '
                'operable openings equal to 4% of floor area or mechanical '
                'ventilation. HVAC mechanical ventilation systems per ASHRAE '
                '62.2 (minimum 7.5 CFM per person plus 0.01 CFM/sq ft) satisfy '
                'the mechanical ventilation requirement. Bathroom exhaust fans '
                'must discharge to the outdoors — not into attics or crawl spaces.'),
               ('R310', 'Emergency Escape',
                'Section R310 requires emergency escape and rescue openings in '
                'every sleeping room and in basements used for sleeping. Minimum '
                'net clear opening: 5.7 sq ft (5.0 sq ft at grade), minimum '
                'height 24 inches, minimum width 20 inches, maximum sill height '
                '44 inches above floor. HVAC contractors must ensure that window '
                'air conditioning units do not permanently block required emergency '
                'escape openings without an approved alternative exit.')]),
        ('4', [('R401', 'General',
                'Section R401 requires foundation design based on soil bearing '
                'capacity and local frost depth. Footings must extend below the '
                'frost line — Oklahoma minimum is 12 inches below grade (some '
                'jurisdictions require 18 inches). HVAC contractors must '
                'coordinate gas line and refrigerant line penetrations through '
                'foundations with the foundation design, ensuring proper '
                'sleeves and seals to prevent moisture intrusion and '
                'radon entry.')]),
        ('5', [('R501', 'General',
                'Section R501 covers floor construction requirements. Section '
                'R502.8 limits holes in floor joists to 1/3 the joist depth '
                'and requires holes be located at least 2 inches from the top '
                'and bottom edges. These limits apply to HVAC ductwork and '
                'piping penetrations through floor framing. Floor registers '
                'for supply and return air must have smooth interior surfaces '
                'and be appropriately sized for the design airflow.')]),
        ('6', [('R601', 'General',
                'Section R601 covers wall framing requirements. Section R602.6 '
                'limits notches in bearing stud walls to 25% of stud width, '
                'holes to 40% of stud width, and requires metal strapping when '
                'notches exceed 25%. HVAC mini-split line sets penetrating '
                'exterior walls must be sealed against air infiltration per '
                'IECC Section R402.4. Bathroom exhaust fan penetrations through '
                'exterior walls require caps with backdraft dampers.')]),
        ('7', [('R701', 'General',
                'Section R701 requires exterior wall coverings to be weather '
                'resistant and include a continuous water-resistive barrier behind '
                'all cladding. Penetrations for HVAC equipment — including direct-vent '
                'terminations, exhaust fans, dryer vents, and condensing unit '
                'line-set penetrations — must be properly flashed per Section '
                'R703.4. Sealant must be applied around all penetrations and '
                'must be compatible with the wall cladding material.')]),
        ('8', [('R801', 'General',
                'Section R801 covers roof-ceiling construction requirements. Attic '
                'access openings per Section R807.1 must be minimum 22 × 30 '
                'inches — no attic-mounted equipment may obstruct the access. '
                'A walkway from the access to HVAC equipment is required per '
                'M1305.1.3. Attic ventilation per Section R806 requires 1/150 '
                'of attic floor area as net free ventilation area (or 1/300 '
                'with balanced ridge-and-eave ventilation). HVAC equipment must '
                'not block soffit or ridge ventilation.')]),
        ('9', [('R901', 'General',
                'Section R901 requires roof covering materials to be listed per '
                'applicable standards and resist local wind speeds per Table '
                'R301.2(1). Rooftop HVAC equipment on low-slope roofs must be '
                'on listed curbs maintaining the roof membrane integrity. '
                'Condensate discharge from rooftop HVAC equipment must drain '
                'to a lawful point of disposal and must not cause ice damming '
                'or freeze damage on the roof surface.')]),
        ('10', [('R1001', 'Fireplaces',
                 'Section R1001 covers masonry fireplaces. Firebox dimensions, '
                 'hearth extension size, damper location, and smoke chamber '
                 'construction are specified. Gas log sets installed in masonry '
                 'fireplaces require the chimney damper to be permanently held '
                 'open with a metal stop device. Section R1001.12 requires a '
                 'cleanout opening at the base of the flue. HVAC contractors '
                 'installing gas log sets must verify the chimney size and '
                 'condition.'),
                ('R1003', 'Masonry Chimneys',
                 'Section R1003 requires masonry chimneys to be constructed '
                 'with minimum 4-inch thick masonry with fireclay flue lining. '
                 'Clearance to combustible framing must be minimum 2 inches. '
                 'Section R1003.9.1 requires chimney caps with drip edges. '
                 'Gas appliance venting into masonry chimneys may require an '
                 'aluminum or stainless-steel liner installed per NFPA 54 '
                 'Appendix B to properly size the vent and protect the masonry '
                 'from condensation damage.')]),
        ('11', [('R1101', 'General',
                 'Section R1101 requires new residential construction to comply '
                 'with IECC Residential provisions. Oklahoma Climate Zone 3A '
                 'requires: ceiling R-38 (attic), wall R-20 or R-13+5ci, floor '
                 'R-19, foundation wall R-10/13. HVAC equipment minimum '
                 'efficiencies: 15 SEER2 / 8.1 HSPF2 for heat pumps, 14.3 '
                 'SEER2 for central air, 80% AFUE for gas furnaces. Manual J '
                 'load calculations and Manual S equipment selection are required '
                 'documentation for new construction permits.'),
                ('R1103', 'Fenestration',
                 'Section R1103 and IECC Table R402.1.3 specify maximum U-factor '
                 'and SHGC for windows, skylights, and doors in Climate Zone 3A: '
                 'vertical fenestration maximum U-0.30 and SHGC-0.25, skylights '
                 'maximum U-0.65 and SHGC-0.25. High SHGC increases cooling '
                 'loads significantly in Oklahoma\'s sunny climate. HVAC '
                 'contractors should verify window specifications early in design '
                 'to ensure proper load calculations and equipment sizing.'),
                ('R1104', 'Sealing',
                 'Section R1104 and IECC Table R402.4.1.1 list required air '
                 'barrier and insulation inspection items including insulation '
                 'installation per the insulation contractor, all penetrations '
                 'sealed, duct system sealed, and electrical/plumbing penetrations '
                 'sealed. Blower door testing per IECC Section R402.4.1.2 must '
                 'demonstrate ≤5.0 ACH50 in Climate Zone 3A before insulation '
                 'is covered. Duct leakage testing per IECC Section R403.3.3 '
                 'must demonstrate ≤4 CFM25 per 100 sq ft of conditioned floor '
                 'area.')]),
        ('12', [('M1201', 'General',
                 'Section M1201 establishes that mechanical system permits are '
                 'required under the IRC administrative provisions of Chapter R1. '
                 'All mechanical work must comply with Chapters M12 through M24 '
                 'and with referenced standards. The code official has full '
                 'authority to inspect mechanical work. Equipment must be listed '
                 'and installed per manufacturer instructions. Unlisted equipment '
                 'requires specific code official approval.')]),
        ('13', [('M1301', 'General',
                 'Section M1301 requires all mechanical systems to be designed '
                 'and installed per manufacturer instructions, the IRC, and '
                 'referenced standards. Equipment must be suitable for its '
                 'location and use. Section M1301.2 prohibits fuel-burning '
                 'equipment in sleeping rooms or bathrooms unless direct-vent '
                 'type. Equipment must be accessible for service per Section '
                 'M1305. Working clearances and service space requirements are '
                 'the same as IMC Section 306.')]),
        ('14', [('M1401', 'General',
                 'Section M1401 requires heating and cooling equipment to be '
                 'listed and labeled by an approved testing agency and installed '
                 'per the listing. Equipment must be sized using ACCA Manual J '
                 'load calculations — rule-of-thumb sizing is not permitted. '
                 'Section M1402 covers heat pump requirements including defrost '
                 'controls, refrigerant management, and backup heat operation. '
                 'Section M1411 addresses refrigerant handling per EPA Section '
                 '608 for technicians working on residential systems.')]),
        ('15', [('M1501', 'General',
                 'Section M1501 requires exhaust systems to discharge to the '
                 'outdoors. Section M1503 covers domestic kitchen exhaust: '
                 'ducted range hoods must use minimum 3-1/4 × 10-inch duct or '
                 '6-inch round, smooth metal only. Recirculating hoods with '
                 'charcoal filters are permitted per Section M1503.3. Section '
                 'M1505 limits dryer exhaust duct length to 35 feet (less 2.5 '
                 'feet per 90° elbow, 1.25 feet per 45° elbow), with booster '
                 'fans required for longer runs.')]),
        ('16', [('M1601', 'General',
                 'Section M1601 requires duct systems to be constructed per '
                 'SMACNA HVAC Duct Construction Standards. Flexible duct is '
                 'permitted but limited to 5-foot maximum length per connection '
                 'and must be fully extended without compression. Section '
                 'M1601.4 requires all duct joints and seams to be sealed '
                 'with mastic or UL 181 listed tape. Duct tape (cloth) is '
                 'NOT an approved duct sealant. Insulation per IECC R403.3 '
                 'required for unconditioned space duct runs.')]),
        ('17', [('M1701', 'General',
                 'Section M1701 requires combustion air for fuel-burning '
                 'appliances per the methods in IFGC Chapter 3 or IRC Chapter '
                 'M17. The indoor air method (50 cu ft per 1,000 Btu/hr) and '
                 'outdoor air method (two openings sized per Table M1703.2) '
                 'both apply to residential installations. Direct-vent and '
                 'power-vent sealed-combustion appliances are exempt from '
                 'combustion air requirements because they draw air from outdoors.')]),
        ('18', [('M1801', 'General',
                 'Section M1801 requires all vented gas appliances to be '
                 'connected to an approved vent system. Section M1803 covers '
                 'vent connector requirements: slope minimum 1/4 inch per foot '
                 'upward to the vent, single-wall connector limited to 75% of '
                 'vent height as horizontal run. Section M1804 addresses masonry '
                 'chimney use for gas appliances, typically requiring a listed '
                 'liner sized per Tables B-1 through B-11 of the IFGC Appendix.')]),
        ('19', [('M1901', 'General',
                 'Section M1901 covers room heaters including wall heaters, '
                 'floor furnaces, and unvented room heaters. Unvented room '
                 'heaters per Section M1905 require oxygen depletion sensor '
                 '(ODS) pilot systems and are limited to 40,000 Btu/hr per '
                 'Section M1905.2. Many jurisdictions prohibit unvented heaters. '
                 'Pellet stoves and EPA-certified wood stoves must be installed '
                 'per their listing with specified clearances.')]),
        ('20', [('M2001', 'General',
                 'Section M2001 requires boilers to comply with ASME Code '
                 'Section IV for heating boilers or Section VIII for high-pressure '
                 'vessels. All residential boilers must have automatic operating '
                 'and high-limit controls, T&P relief valves, and for steam '
                 'boilers, low-water cutoffs per Section M2001.2. Boiler rooms '
                 'require combustion air per Chapter M17 and proper venting '
                 'per Chapter M18.')]),
        ('21', [('M2101', 'General',
                 'Section M2101 covers hydronic heating system installation. '
                 'Systems must be pressure tested at 1.5 times working pressure '
                 'for minimum 15 minutes. Expansion tanks per Section M2103 '
                 'must be sized for the total system volume. Air purgers and '
                 'manual air vents at high points per Section M2101.4 are '
                 'required. Radiant floor heating systems using PEX tubing '
                 'must include mixing valves to limit floor surface temperature '
                 'to 85°F maximum.')]),
        ('22', [('M2201', 'General',
                 'Section M2201 covers oil and fuel oil storage for oil-fired '
                 'residential heating equipment. Fuel oil tanks must comply '
                 'with NFPA 31 and UL 80 (steel tanks) or UL 1316 (fiberglass). '
                 'Indoor tanks are limited to 660 gallons. Outdoor above-ground '
                 'tanks require setbacks from buildings and property lines. '
                 'Underground tanks are subject to EPA UST regulations.')]),
        ('23', [('M2301', 'General',
                 'Section M2301 covers residential solar thermal systems. '
                 'Collectors must be listed per SRCC or ISO 9806. System '
                 'must include overheat protection, freeze protection, and '
                 'pressure relief per Section M2302. Storage tanks for solar '
                 'thermal systems must maintain minimum water temperature of '
                 '120°F at the distribution system to prevent Legionella growth, '
                 'or include secondary disinfection measures.')]),
        ('24', [('G2401', 'General',
                 'Section G2401 states that fuel gas systems in one- and two-family '
                 'dwellings must comply with IFGC or NFPA 54 (National Fuel Gas '
                 'Code). Gas permits are required per R105. Section G2401.3 '
                 'requires gas piping to be sized to provide sufficient pressure '
                 'at each appliance under simultaneous full-load conditions using '
                 'the longest-length or branch-length method with the sizing '
                 'tables from IFGC Section 402.')]),
    ]:
        pid = _ch(conn, bid, ch)
        if pid:
            _ins(conn, bid, pid, secs)


# ── IPC (International Plumbing Code 2021) ───────────────────────

def _seed_ipc(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'Chapter 1 establishes scope and administrative provisions for the IPC, covering '
        'design, installation, alteration, repair, and maintenance of plumbing systems in '
        'all buildings except one- and two-family dwellings (which use IRC plumbing chapters). '
        'Plumbing permits are required before work begins. HVAC contractors must coordinate '
        'condensate disposal, hydronic connections, and mechanical room floor drains with '
        'the licensed plumbing contractor.')
    _update_content(conn, bid, '2',
        'Chapter 2 defines plumbing terms including BACKFLOW, CROSS-CONNECTION, FIXTURE '
        'UNIT, POTABLE WATER, SANITARY SEWER, TRAP, and VENT. The definition of INDIRECT '
        'WASTE is important for HVAC contractors — condensate drains from HVAC equipment '
        'must connect to the drainage system as indirect waste through an air gap, not '
        'directly to a drain receptor.')
    _update_content(conn, bid, '3',
        'Chapter 3 covers general plumbing installation requirements including material '
        'certifications, protection from damage, support, testing, and protection from '
        'freezing. HVAC condensate piping made of PVC or CPVC must be third-party certified '
        'per ASTM standards. Piping must be supported at intervals per Table 308.5 and '
        'protected from freezing in unconditioned spaces.')
    _update_content(conn, bid, '4',
        'Chapter 4 covers plumbing fixtures, faucet flow rates, and fixture counts by '
        'occupancy. Water closet maximum 1.28 gpf, lavatory faucet maximum 0.5 gpm at '
        '60 psi, and shower head maximum 2.0 gpm per Section 408. Table 403.1 specifies '
        'minimum fixture counts — HVAC contractors must ensure mechanical room floor '
        'drains and service sinks are included in the fixture count.')
    _update_content(conn, bid, '5',
        'Chapter 5 covers water heater installation including T&P relief valves, '
        'expansion tanks, and discharge piping. T&P relief valve discharge must terminate '
        'within 6 inches of floor. Closed-system water heaters (with backflow preventer '
        'on cold supply) require a properly sized thermal expansion tank per Section 607.3.2. '
        'Gas water heater venting per IFGC Chapter 5.')
    _update_content(conn, bid, '6',
        'Chapter 6 covers water supply and distribution including pipe sizing, pressure '
        'requirements (minimum 40 psi at fixtures), velocity limits (maximum 8 fps), and '
        'backflow prevention. HVAC equipment water connections — cooling tower makeup water, '
        'humidifier supply, hydronic system fill — all require backflow prevention per '
        'Section 608 at the degree of hazard present. Reduced pressure zone (RPZ) assemblies '
        'are required for boiler system connections due to chemical treatment additives.')
    _update_content(conn, bid, '7',
        'Chapter 7 covers sanitary drainage system design including pipe sizing by drainage '
        'fixture units (DFU), minimum slope (1/4 inch per foot for pipes 3 inches and '
        'smaller), and approved materials (PVC Schedule 40, ABS, cast iron). HVAC '
        'condensate drains connect to the sanitary system through floor drains or '
        'condensate pumps as indirect waste per Section 802.')
    _update_content(conn, bid, '8',
        'Chapter 8 covers indirect and special waste including food service equipment, '
        'commercial dishwashers, medical equipment, and HVAC condensate. Section 802.4 '
        'specifies minimum air gap for indirect waste connections: 1 inch for receptor '
        'up to 1.5 inches; 1.5 inches for receptors 1.5 to 3 inches; 2 times the diameter '
        'of the discharge pipe. HVAC condensate drains are indirect waste connections.')
    _update_content(conn, bid, '9',
        'Chapter 9 covers plumbing vent systems including individual vents, circuit vents, '
        'wet vents, and air admittance valves (AAVs). Vent sizing per Table 906.2 is '
        'based on drainage fixture units. AAVs are permitted for individual fixtures '
        'per Section 918 but not as the sole vent for main building drains. Condensate '
        'drain connections to vented drain lines do not require additional venting if '
        'the connection is made to an already-vented portion of the drain.')
    _update_content(conn, bid, '10',
        'Chapter 10 covers traps, interceptors, and separators. Section 1002 requires '
        'traps on all fixtures and indirect waste receptors — including condensate floor '
        'drains receiving HVAC coil drainage. Trap depth must be 2-4 inches. Section '
        '1003 covers grease interceptors required for commercial food service facilities '
        'where HVAC contractors install kitchen exhaust hoods. Oil and sand interceptors '
        'are required in garages and automotive service facilities.')
    _update_content(conn, bid, '11',
        'Chapter 11 covers storm drainage including roof drainage design, area drains, '
        'and conductor sizing. HVAC condensate may be directed to storm drainage in some '
        'jurisdictions if the volume is minimal and no chemical treatment is used. Cooling '
        'tower blowdown typically must go to the sanitary sewer due to biocide content. '
        'Roof drainage design must accommodate HVAC equipment curbs that interrupt '
        'drainage flow.')
    _update_content(conn, bid, '12',
        'Chapter 12 covers special piping and storage systems including medical gas, '
        'compressed air, and vacuum systems. HVAC contractors in healthcare facilities '
        'may encounter medical gas systems that must be installed and tested by ASSE '
        '6010 certified medical gas technicians — general mechanical contractors cannot '
        'work on medical gas systems without this certification.')
    _update_content(conn, bid, '13',
        'Chapter 13 lists all IPC referenced standards including ASME A112 fixture '
        'standards, ASTM pipe material standards, ASSE backflow prevention standards, '
        'NSF 61 for potable water components, and IAPMO installation standards. HVAC '
        'condensate drain materials (PVC ASTM D1785 or D2665) and fittings must comply '
        'with the applicable ASTM or ASME standards listed in Chapter 13.')

    # ── Depth=1 sections ───────────────────────────────────────────
    for ch, secs in [
        ('1', [('101', 'Scope',
                'Section 101 states that the IPC regulates all plumbing systems in '
                'buildings subject to the IBC. It covers sanitary drainage, storm '
                'drainage, and potable water supply systems. The IPC does not apply '
                'to detached one- and two-family dwellings (those use IRC Chapter '
                '25-33). HVAC contractors must be aware that condensate disposal '
                'systems, humidifier connections, and mechanical room floor drains '
                'are regulated by the IPC and require plumbing permit coverage.'),
               ('106', 'Permits',
                'Section 106 requires plumbing permits before starting any plumbing '
                'work. Work must be performed by a licensed plumber in most jurisdictions. '
                'Inspections are required before concealment of pipes. Section 106.3 '
                'exempts minor repairs that do not alter the plumbing system. HVAC '
                'condensate drain piping additions and mechanical room floor drain '
                'connections require a plumbing permit in most jurisdictions even '
                'when performed during mechanical work.')]),
        ('2', [('201', 'General',
                'Key definitions for HVAC contractors: INDIRECT WASTE PIPE is a pipe '
                'that does not connect directly to the drainage system but discharges '
                'into a plumbing fixture or floor drain; AIR GAP is the unobstructed '
                'vertical distance between the lowest opening of a discharge pipe and '
                'the flood level rim of a receiving fixture; CROSS-CONNECTION is any '
                'physical connection between potable water and a non-potable source. '
                'All HVAC equipment connections to potable water must include backflow '
                'prevention to prevent cross-connection.')]),
        ('3', [('301', 'General',
                'Section 301 requires all plumbing materials to be third-party certified '
                'to applicable product standards. PVC condensate drain pipe must be '
                'ASTM D1785 (Schedule 40) or D2665 (DWV). Copper used in plumbing '
                'must be NSF 61 listed for potable water contact. Section 301.3 '
                'prohibits unlisted or untested materials. Section 301.6 requires '
                'protection from physical damage, corrosion, and freezing. Condensate '
                'drain lines in unconditioned spaces must be insulated or protected.'),
               ('305', 'Protection of Pipes',
                'Section 305 requires piping to be protected where subject to damage, '
                'freezing, or chemical attack. Piping through concrete must be sleeved '
                'or coated. Underground piping must be at least 12 inches below frost '
                'line. Section 305.6 requires metallic piping in contact with concrete '
                'or soil to be insulated or protected with approved coating. HVAC '
                'condensate drain lines in crawl spaces must be sleeved where they '
                'penetrate floor framing.'),
               ('312', 'Tests',
                'Section 312 requires plumbing systems to be tested before approval. '
                'DWV systems must be tested with water (10 feet of head for minimum '
                '15 minutes) or air (5 psi for minimum 15 minutes). Water supply '
                'systems must be tested at working pressure plus 50 psi or 100 psi '
                'minimum for 15 minutes. No leakage is permitted. HVAC contractors '
                'whose condensate drain piping ties into the sanitary system must '
                'coordinate testing with the plumbing contractor.')]),
        ('4', [('401', 'General',
                'Section 401 requires plumbing fixtures to be third-party certified '
                'to ASME A112 standards. Water closets are limited to 1.28 gpf '
                '(high-efficiency) per Section 402. Lavatory faucets are limited '
                'to 0.5 gpm at 60 psi. Shower heads are limited to 2.0 gpm at '
                '80 psi per Section 408. These flow rate limits affect HVAC '
                'system water demand calculations for buildings with multiple '
                'fixtures.'),
               ('403', 'Minimum Fixtures',
                'Table 403.1 specifies minimum plumbing fixture counts by occupancy '
                'type and occupant load. Office buildings require 1 water closet '
                'per 25 occupants for the first 50, then 1 per 50 thereafter '
                '(separate per sex). Mechanical rooms require a service sink per '
                'IPC Table 403.1 footnotes. Section 403.2 requires separate '
                'toilet facilities for each sex when the occupant load exceeds 15.')]),
        ('5', [('501', 'General',
                'Section 501 requires water heaters to be listed per applicable '
                'ANSI standards (Z21.10 for gas, UL 174 for electric) and installed '
                'per listing and manufacturer instructions. T&P relief valves per '
                'Section 504 must be installed on all water heaters and set at or '
                'below the maximum working pressure and temperature (150 psi and '
                '210°F). Relief valve sizing must exceed the water heater BTU input.'),
               ('502', 'Installation',
                'Section 502 requires gas water heaters in garages to be elevated '
                '18 inches above the floor (same as IFGC Section 303.3). A drain '
                'pan with a minimum 3/4-inch drain is required under water heaters '
                'in locations where leakage could cause property damage per Section '
                '504.7. Expansion tanks per Section 607.3.2 are required where a '
                'backflow preventer creates a closed system.')]),
        ('6', [('601', 'General',
                'Section 601 requires water supply systems to provide minimum 40 '
                'psi at each fixture during maximum demand flow conditions. Maximum '
                'velocity is 8 fps to prevent noise and erosion per Section 604.3. '
                'Section 606 requires a main shutoff valve at the point of entry '
                'into each building and individual shutoffs at each fixture. '
                'HVAC humidifier and cooling tower makeup water connections require '
                'shutoff valves and flow control.'),
               ('604', 'Pipe Sizing',
                'Section 604 requires water distribution piping to be sized using '
                'the water supply fixture unit (WSFU) method per Tables 604.3 '
                'through 604.5, or by hydraulic analysis. Sizing must provide '
                'minimum flow rates at each fixture under simultaneous demand. '
                'HVAC equipment with high-flow water connections (cooling towers, '
                'large humidifiers) must be included in the fixture unit count '
                'for system sizing.'),
               ('608', 'Backflow Prevention',
                'Section 608 requires backflow prevention at all cross-connections '
                'between potable water and non-potable systems. Degree of hazard '
                'determines the type of protection: air gap for high hazard, '
                'reduced pressure zone (RPZ) assembly for pollutants, double check '
                'valve for non-health hazards. Boiler systems with chemical '
                'treatment require an RPZ backflow preventer on the makeup water '
                'connection. RPZ assemblies must be tested annually by a certified '
                'tester.')]),
        ('7', [('701', 'General',
                'Section 701 requires sanitary drainage piping to slope at '
                'minimum 1/4 inch per foot for pipes 3 inches diameter and '
                'smaller, and minimum 1/8 inch per foot for 4-inch and larger. '
                'Horizontal drainage pipe must be pitched continuously toward '
                'the building drain. HVAC condensate drain lines must maintain '
                'proper slope — 3/4-inch drain lines typically require 1/4-inch '
                'per foot minimum slope.'),
               ('702', 'Materials',
                'Section 702 lists approved sanitary drainage materials: PVC '
                'Schedule 40 (ASTM D2665), ABS Schedule 40 (ASTM D2661), cast '
                'iron service weight or extra heavy (ASTM A888), and copper DWV '
                '(ASTM B306). Galvanized steel is NOT permitted for drainage '
                'piping underground. Hub-and-spigot cast iron joints use ASTM '
                'C564 rubber gaskets; no-hub cast iron uses CISPI 310 couplings.'),
               ('706', 'Fixture Connections',
                'Section 706 requires each plumbing fixture to connect to the '
                'drainage system through a trap. The connection must maintain '
                'the slope requirements of Section 701. Horizontal distance from '
                'the trap weir to the vent (trap arm) is limited to 60 times '
                'the pipe diameter for 1-1/4 inch and smaller and 72 times the '
                'diameter for larger pipe. HVAC condensate drain pans are fixtures '
                'per Section 202 and require a trapped connection.')]),
        ('8', [('801', 'General',
                'Section 801 establishes requirements for indirect waste connections. '
                'HVAC equipment condensate — from cooling coils, air handlers, '
                'and fan coil units — must be piped as indirect waste per Section '
                '802. The discharge from the condensate drain must drain through '
                'an air gap into an approved indirect waste receptor (floor drain, '
                'mop sink, standpipe) or to the outdoors to a lawful disposal '
                'location per Section 802.1.')]),
        ('9', [('901', 'General',
                'Section 901 requires all plumbing fixtures to be vented to '
                'prevent loss of trap seals. The vent system equalizes pressure '
                'in the drainage system to prevent siphoning or back-pressure '
                'from blowing trap seals. Section 901.2 prohibits using vent '
                'piping as drain piping and drain piping as vent piping. '
                'HVAC condensate drain traps must be vented or protected from '
                'siphoning if connected to the sanitary system.')]),
        ('10', [('1001', 'Traps Required',
                 'Section 1001 requires a trap on every plumbing fixture and '
                 'on all indirect waste receptors. Each trap must be self-scouring, '
                 'free from interior partitions, and have a liquid seal of 2 to '
                 '4 inches. Floor drains receiving HVAC condensate must have '
                 'their trap seals maintained — floor drains that dry out lose '
                 'their trap seal and allow sewer gas to enter the mechanical room. '
                 'Trap primers or trap primer valves are required on seldom-used '
                 'floor drains per Section 1002.4.')]),
        ('11', [('1101', 'General',
                 'Section 1101 requires storm drainage systems sized to handle the '
                 '100-year storm event per the local rainfall intensity data. Roof '
                 'drains must be protected against blockage by screens. HVAC '
                 'equipment curbs on low-slope roofs must not impede roof drainage '
                 'flow. Emergency overflow scuppers or secondary roof drains per '
                 'Section 1108 are required when primary drains could become blocked.')]),
        ('12', [('1201', 'General',
                 'Section 1201 covers special plumbing systems including medical '
                 'gas, vacuum, compressed air, and nonflammable medical gas systems. '
                 'Medical gas systems must be designed, installed, and tested by '
                 'ASSE 6010 certified personnel. HVAC contractors must not work on '
                 'medical gas systems without this certification. Medical gas system '
                 'design per NFPA 99 is required for healthcare occupancies.')]),
        ('13', [('1301', 'General',
                 'Chapter 13 lists all IPC referenced standards. Key standards '
                 'include ASTM D1785 and D2665 (PVC piping), ASTM D2661 (ABS), '
                 'ASTM A888 (cast iron), ASSE 1013 (RPZ backflow preventers), '
                 'ASSE 1015 (double check valves), ASSE 1019 (wall hydrant '
                 'backflow), NSF 61 (potable water components), and ASME A112 '
                 'fixture standards. All materials and assemblies used must comply '
                 'with the applicable listed standard edition.')]),
    ]:
        pid = _ch(conn, bid, ch)
        if pid:
            _ins(conn, bid, pid, secs)

# ── NEC (National Electrical Code 2020) ──────────────────────────

def _seed_nec(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, '1',
        'NEC Article 1 (90 through 110) covers general provisions including the purpose '
        'and scope of the NEC, definitions, and requirements for electrical installations. '
        'Article 110 specifies working space clearances, conductor temperature ratings, '
        'and equipment approval. HVAC equipment must be listed (UL, ETL, or CSA) and '
        'installed with adequate working clearance — minimum 36 inches in front of panels '
        'and equipment requiring access for service.')
    _update_content(conn, bid, '2',
        'NEC Chapter 2 (Articles 200-285) covers wiring and protection including grounding '
        'and bonding (Article 250), branch circuit requirements (Article 210), and feeder '
        'sizing (Article 220). HVAC contractors must ensure HVAC equipment is properly '
        'grounded and bonded. CSST gas piping must be bonded to the electrical grounding '
        'system per NEC Section 250.104(B). Equipment grounding conductors must be sized '
        'per Table 250.122.')
    _update_content(conn, bid, '3',
        'NEC Chapter 3 (Articles 300-398) covers wiring methods and materials including '
        'conduit types, cable types, conductor sizing, and raceway fill. HVAC control '
        'wiring (24V) installed as Class 2 circuits per Article 725 has relaxed installation '
        'requirements. Power wiring to HVAC equipment must use appropriate raceways (EMT, '
        'RMC, MC cable) with conductors sized per Table 310.16 and rated for the ambient '
        'temperature conditions.')
    _update_content(conn, bid, '4',
        'NEC Chapter 4 (Articles 400-490) covers equipment for general use including '
        'luminaires (Article 410), appliances (Article 422), fixed electric heating '
        '(Article 424), motors (Article 430), and air conditioning equipment (Article 440). '
        'Article 440 is the primary NEC section for HVAC contractors, governing equipment '
        'disconnects, circuit sizing using MCA and MOCP nameplate values, and hermetic '
        'refrigerant motor-compressor requirements.')
    _update_content(conn, bid, '5',
        'NEC Chapter 5 (Articles 500-590) covers special occupancies including hazardous '
        'locations (Articles 500-516), healthcare facilities (Article 517), and other '
        'special environments. HVAC contractors working in classified hazardous locations '
        '(spray booths, fuel dispensing areas, chemical storage) must use explosion-proof '
        'or intrinsically safe electrical equipment rated for the specific hazardous '
        'location class and division.')
    _update_content(conn, bid, '6',
        'NEC Chapter 6 (Articles 600-695) covers special equipment including electric signs '
        '(Article 600), elevators (Article 620), electric vehicle charging (Article 625), '
        'swimming pools (Article 680), and emergency systems (Article 700). HVAC contractors '
        'must coordinate on elevator machine room temperature control (Article 620), EV '
        'charging infrastructure (increasing demand), and pool heat pump bonding per '
        'Article 680.')
    _update_content(conn, bid, '7',
        'NEC Chapter 7 (Articles 700-770) covers special conditions including emergency '
        'systems (Article 700), legally required standby (Article 701), optional standby '
        '(Article 702), and fire alarm systems (Article 760). HVAC contractors designing '
        'smoke control systems must understand Article 700 requirements for emergency '
        'power to critical HVAC fans. Smoke control fans must be on an emergency system '
        'with automatic transfer within 60 seconds.')
    _update_content(conn, bid, '8',
        'NEC Chapter 8 (Articles 800-830) covers communications systems including telephone '
        'wiring, coaxial cable TV, network cabling, and radio systems. Building automation '
        'systems (BAS) and HVAC control networks may use structured wiring covered under '
        'Chapter 8. Low-voltage HVAC controls must be installed in separate raceways from '
        'power conductors or in listed multi-conductor cable assemblies rated for the voltage.')
    _update_content(conn, bid, '9',
        'NEC Chapter 9 contains tables used throughout the NEC including conductor properties '
        '(Table 8), conduit fill tables (Tables 1, 4, and 5), and voltage drop tables '
        '(Table 9). Table 310.16 (Allowable Ampacities) is the most-used table for sizing '
        'HVAC equipment wiring. Conduit fill calculations per Chapter 9 tables ensure '
        'conductors can be pulled without damage and derating for high-fill conditions is '
        'properly applied.')

    # ── Depth=1 sections ───────────────────────────────────────────
    for ch, secs in [
        ('1', [('110', 'Requirements for Electrical Installations',
                'Article 110 establishes general requirements for all electrical installations. '
                'Section 110.26 specifies working space: minimum 36 inches depth (Condition 1 '
                '— exposed live parts on one side), 42 inches (Condition 2 — live parts on '
                'both sides), or 48 inches (Condition 3 — live parts on both sides at '
                'different voltages). Minimum 30-inch width (or equipment width, whichever '
                'is greater) and minimum 6.5-foot headroom. HVAC electrical panels and '
                'disconnects must maintain these clearances. Dedicated electrical space '
                'above panels (to ceiling or 6 feet above panel, whichever is less) '
                'must be kept clear of pipes and ducts.'),
               ('100', 'Definitions',
                'Key Article 100 definitions for HVAC work: ACCESSIBLE (for equipment — '
                'capable of being removed without damaging building finish; for wiring — '
                'capable of being removed without use of tools); LISTED (equipment meeting '
                'a standard and included in a list published by a nationally recognized '
                'testing laboratory); QUALIFIED PERSON (one with skills and knowledge '
                'related to electrical equipment and installations); SERVICE (conductors '
                'and equipment for delivering energy from the supply system to the building). '
                'All HVAC equipment must be LISTED per these definitions.'),
               ('90', 'Introduction',
                'Article 90 states the NEC purpose: practical safeguarding of persons and '
                'property from hazards arising from the use of electricity. The NEC is an '
                'installation standard — it governs how electrical systems are installed, '
                'not how they are designed for capacity or efficiency (those are covered '
                'by IECC and ASHRAE 90.1). Section 90.2 defines the NEC scope as covering '
                'all premises wiring including HVAC equipment electrical connections. '
                'Section 90.4 places enforcement authority with the AHJ (code official).'),
               ('110.26', 'Working Space',
                'Section 110.26(A) specifies minimum working space in front of electrical '
                'equipment: 36 inches depth for Condition 1, 42 inches for Condition 2, '
                '48 inches for Condition 3. Width must be at least 30 inches or the '
                'equipment width, whichever is greater. Headroom minimum 6.5 feet. '
                'Section 110.26(E) requires dedicated electrical space from the top of '
                'the panel to the structural ceiling or 6 feet above the panel — HVAC '
                'ductwork and piping must not enter this dedicated space. HVAC contractors '
                'must coordinate equipment placement with electrical room layouts early '
                'in construction.')]),
        ('2', [('200', 'Use of Grounded Conductors',
                'Article 200 requires the grounded (neutral) conductor to be identified '
                'with white or gray insulation. Section 200.7 prohibits using the '
                'grounded conductor as an ungrounded conductor except in very specific '
                'circumstances. In HVAC 240V two-wire circuits (no neutral), both '
                'conductors are ungrounded (hot) conductors — not a grounded conductor. '
                'HVAC contractors must ensure neutral conductors are not inadvertently '
                'used as ground conductors.'),
               ('210', 'Branch Circuits',
                'Article 210 covers branch circuit requirements. Section 210.8 requires '
                'GFCI protection for receptacles in bathrooms, garages, outdoors, '
                'unfinished basements, and areas within 6 feet of a sink. HVAC equipment '
                'receptacles near mechanical room sinks or in unfinished spaces require '
                'GFCI protection. Section 210.63 requires a 125V 15A receptacle within '
                '25 feet of HVAC equipment in attics and crawl spaces for maintenance '
                'power.'),
               ('220', 'Branch-Circuit/Feeder Calculations',
                'Article 220 provides load calculation methods. Table 220.12 specifies '
                'general lighting load densities: 3.5 VA/sq ft for office, 1.5 VA/sq ft '
                'for residential. HVAC equipment loads are calculated from nameplate '
                'ampacity data per Article 440 (air conditioning) or Article 430 (motors). '
                'Service and feeder sizing must include all HVAC loads. The largest motor '
                'in an HVAC system is calculated at 125% per Section 430.24 to account '
                'for motor starting inrush.'),
               ('225', 'Outside Branch Circuits',
                'Article 225 covers outdoor branch circuits and feeders. Section 225.18 '
                'specifies minimum clearances: 10 feet above finished grade, 12 feet '
                'over residential driveways, 18 feet over public roads. Outdoor '
                'disconnect switches for HVAC equipment must be listed as raintight '
                'and located within sight of the condensing unit per Section 440.14. '
                'Circuits to outdoor HVAC equipment should use weatherproof raceways '
                'or UF cable appropriate for outdoor and sunlight exposure.'),
               ('250', 'Grounding and Bonding',
                'Article 250 is one of the most complex NEC articles and is critical '
                'for HVAC work. Section 250.104(B) requires CSST gas piping to be '
                'bonded to the electrical grounding system with a minimum 6 AWG '
                'copper bonding conductor to prevent arcing damage from lightning '
                'surges. HVAC equipment frames and enclosures must be grounded via '
                'equipment grounding conductors sized per Table 250.122. Section '
                '250.52 and 250.53 cover grounding electrode systems — Ufer grounds, '
                'ground rods, and metal water pipe electrodes.')]),
        ('3', [('300', 'General Requirements',
                'Article 300 covers general wiring method requirements. Section 300.3 '
                'requires all conductors of a circuit to be run in the same raceway '
                'or cable to prevent electromagnetic interference and overheating. '
                'Section 300.11 prohibits using ceiling grid wires as raceway supports. '
                'Section 300.22 restricts wiring in air handling spaces (plenums) to '
                'plenum-rated cables or cables in metal conduit. HVAC contractors must '
                'ensure that wiring installed in return air plenums is plenum-rated '
                '(CMP, CMG-PLP) per Section 300.22(C).'),
               ('310', 'Conductors',
                'Article 310 specifies conductor types, sizes, and ampacities. Table '
                '310.16 gives allowable ampacities for conductors in conduit: 14 AWG '
                '= 15A, 12 AWG = 20A, 10 AWG = 30A (at 60°C column). HVAC equipment '
                'in high-temperature locations (near boilers, attics over 104°F) may '
                'require 90°C rated conductors (THHN) for the temperature derating '
                'benefit. Section 310.15(B) requires derating when more than 3 '
                'current-carrying conductors share a raceway — 4-6 conductors require '
                '80% derating.'),
               ('320-340', 'Cable Types',
                'NEC Articles 320-340 cover specific cable types: Type AC cable (Article '
                '320, armored cable/BX), Type MC cable (Article 330, metal-clad), '
                'Type NM cable (Article 334, nonmetallic sheathed/Romex), Type SE cable '
                '(Article 338, service entrance), and Type UF cable (Article 340, '
                'underground feeder). Type NM cable is prohibited in commercial '
                'buildings over three stories and in any building required to be '
                'noncombustible construction (Type I or II). HVAC wiring in commercial '
                'buildings typically uses EMT conduit with THHN conductors.'),
               ('342-358', 'Raceways',
                'NEC Articles 342-358 cover conduit and raceway types. IMC (Article 342) '
                'and RMC (Article 344) are suitable for all applications. EMT (Article '
                '358, electrical metallic tubing) is the most common for HVAC equipment '
                'circuits in commercial buildings. Section 358.26 permits a maximum '
                'total of 360° of bends between pull points. Conduit fill limits per '
                'Table 1 of Chapter 9 restrict the number of conductors. When more than '
                '3 current-carrying conductors are in a conduit, ampacity derating per '
                'Table 310.15(C)(1) applies.')]),
        ('4', [('410', 'Luminaires',
                'Article 410 covers luminaires (light fixtures). Section 410.116 requires '
                'luminaires installed in insulated ceilings to be IC-rated (insulation '
                'contact rated) or separated from insulation by 3 inches. HVAC contractors '
                'installing ceiling diffusers and registers must coordinate with electrical '
                'to avoid conflicts with recessed lighting and ensure diffusers do not '
                'direct air onto recessed fixtures in a way that disturbs the fixture '
                'rating.'),
               ('422', 'Appliances',
                'Article 422 covers household and commercial appliances. Section 422.12 '
                'requires central heating and cooling equipment to be on individual branch '
                'circuits. Section 422.30 requires appliance disconnecting means within '
                'sight of the appliance or be lockable in the open position. HVAC units '
                'that are listed as appliances (room air conditioners, packaged terminal '
                'units, heat pump water heaters) fall under Article 422 rather than '
                'Article 440 for circuit sizing.'),
               ('424', 'Fixed Electric Space Heating',
                'Article 424 covers fixed electric heating equipment including electric '
                'furnaces, baseboard heaters, radiant ceiling panels, and heat pump '
                'supplementary heat. Section 424.3 requires branch circuits for fixed '
                'electric heating to not exceed 60A. Supplementary heat strips in heat '
                'pumps are calculated at 100% (not 125% as for motors) since they are '
                'resistive loads. Section 424.65 requires disconnecting means for '
                'duct heaters within sight of the controller.'),
               ('430', 'Motors',
                'Article 430 covers motor circuits and controllers. Section 430.6 requires '
                'motor circuit ampacity to be based on full-load current (FLC) from NEC '
                'Table 430.248 (single-phase) or Table 430.250 (three-phase), not the '
                'nameplate ampere rating. Section 430.52 sizes motor branch circuit '
                'overcurrent protection at 250% of FLC for inverse time breakers. '
                'Motor overload protection per Section 430.32 must be set at no more '
                'than 125% of nameplate full-load current.'),
               ('440', 'Air Conditioning Equipment',
                'Article 440 is the primary NEC reference for HVAC contractors. Section '
                '440.4 requires HVAC equipment nameplates to list minimum circuit ampacity '
                '(MCA) and maximum overcurrent device (MOCP). Section 440.12 sizes the '
                'circuit at MCA (minimum circuit ampacity) or the equipment nameplate '
                'value. Section 440.14 requires a disconnect within sight of the '
                'condensing unit, or lockable in the open position. Section 440.22 '
                'sizes branch circuit overcurrent protection at no more than the MOCP '
                'value on the equipment nameplate.')]),
        ('5', [('500', 'Hazardous Locations',
                'Article 500 defines classified (hazardous) locations and establishes '
                'requirements for electrical equipment in areas where flammable gases, '
                'vapors, or dust may be present. Class I, Division 1 areas require '
                'explosion-proof equipment (UL 674); Class I, Division 2 areas require '
                'equipment that does not produce sparks during normal operation. HVAC '
                'contractors installing refrigeration equipment using A2L or A3 '
                'refrigerants in machinery rooms must classify the room per ASHRAE '
                '15 and NEC Article 500.'),
               ('501', 'Class I Locations',
                'Article 501 covers electrical installations in Class I (flammable gas '
                'or vapor) locations. HVAC refrigeration machinery rooms with flammable '
                'refrigerants (propane R-290, isobutane R-600a, R-32 in larger quantities) '
                'may require Class I, Division 2 classified electrical equipment. R-410A, '
                'R-134a, and R-22 are A1 class refrigerants and do not require classified '
                'electrical equipment. New lower-GWP refrigerants R-32 and R-454B are '
                'A2L class and may require reclassification of machinery room electrical.'),
               ('511', 'Commercial Garages',
                'Article 511 covers electrical installations in commercial garages. '
                'The area up to 18 inches above the floor in repair garages is a '
                'Class I, Division 2 location because heavier-than-air vapors from '
                'fuel can accumulate there. HVAC contractors installing unit heaters '
                'in garages must elevate the ignition source 18 inches per IFGC '
                'Section 303.3 — this aligns with the NEC classified area boundary. '
                'Ventilation systems per IMC Section 404 must be interlocked with '
                'carbon monoxide and fuel vapor detectors.')]),
        ('6', [('600', 'Electric Signs',
                'Article 600 covers electric signs and outline lighting. HVAC contractors '
                'generally do not work on signs but must maintain clearances from sign '
                'circuits when routing HVAC control and power wiring in commercial '
                'buildings. Section 600.9 requires 3-foot clearance from sign equipment '
                'to any combustible material.'),
               ('620', 'Elevators',
                'Article 620 covers elevator and escalator electrical requirements. '
                'Section 620.85 requires GFCI protection for 15A and 20A receptacles '
                'in hoistways and machine rooms. Section 620.82 requires that machine '
                'room heating, cooling, and ventilation systems be dedicated to the '
                'machine room and not shared with other building systems. HVAC '
                'contractors must provide a dedicated split system or precision cooling '
                'unit for elevator machine rooms.'),
               ('625', 'EV Charging',
                'Article 625 covers electric vehicle supply equipment (EVSE). EV charging '
                'is increasingly relevant as HVAC contractors design building energy '
                'systems. EV charging loads must be included in service sizing calculations. '
                'Section 625.48 requires EVSE to be listed. Commercial Level 2 EVSE '
                'requires 208V or 240V 30-50A circuits. HVAC load management systems '
                'may need to coordinate with EV charging load management.'),
               ('680', 'Swimming Pools',
                'Article 680 covers swimming pool, spa, and hot tub electrical requirements. '
                'Section 680.26 requires equipotential bonding of all metal parts within '
                '5 feet of the pool and all water within the pool. Pool heaters (gas or '
                'electric) and heat pumps are bonded equipment. Section 680.27 covers '
                'underwater lighting. Section 680.9 requires GFCI protection for '
                'all 15A and 20A circuits serving pool equipment.'),
               ('700', 'Emergency Systems',
                'Article 700 covers emergency electrical systems required by law to '
                'operate essential facilities during normal power failure. Smoke '
                'control fans, stairwell pressurization fans, and emergency ventilation '
                'systems required by IBC Chapter 9 must be on emergency power per '
                'Article 700. Transfer time must not exceed 60 seconds. HVAC contractors '
                'designing smoke control systems must coordinate with the electrical '
                'engineer for proper emergency system classification.')]),
        ('7', [('700', 'Emergency Systems',
                'Article 700 emergency systems include any system required by code '
                'to operate for safety of human life. Emergency generators must start '
                'and reach full load within 10 seconds and maintain power for a '
                'minimum period as required by the application. HVAC components '
                'on emergency power include smoke control fans, pressurization '
                'fans, fire pump room HVAC, and generator room ventilation.'),
               ('701', 'Legally Required Standby',
                'Article 701 covers legally required standby systems that are not '
                'emergency systems but are required by law. In HVAC applications, '
                'standby power for data center cooling and telecommunications room '
                'cooling may fall under Article 701. Standby generators for these '
                'systems must be sized to carry the full HVAC load in addition to '
                'other standby loads.'),
               ('702', 'Optional Standby',
                'Article 702 covers optional standby systems provided at the owner\'s '
                'discretion for convenience or business continuity. Backup generators '
                'for residential HVAC and commercial process cooling not required '
                'by code fall under Article 702. HVAC contractors providing generator '
                'sizing recommendations for residential standby systems must calculate '
                'starting and running currents for all HVAC equipment to be supported.')]),
        ('8', [('800', 'Communications Circuits',
                'Article 800 covers telephone and communications wiring. Building '
                'automation system (BAS) network cabling may be installed per Article '
                '800 (Category 5e/6 cable) when used for communications. Section '
                '800.133 requires separation of communications wiring from power '
                'conductors in raceways. HVAC DDC controllers communicating via '
                'BACnet over IP or Modbus TCP use structured network wiring per '
                'Article 800.'),
               ('820', 'CATV Systems',
                'Article 820 covers coaxial cable systems for cable television and '
                'broadband communications. HVAC control systems using coaxial cable '
                'for signal transmission (legacy systems) fall under Article 820. '
                'Most modern HVAC controls use IP-based communications, but older '
                'systems and some proprietary controls may use coaxial or other '
                'cable types covered by NEC Chapter 8 articles.'),
               ('Tables', 'Chapter 9 Tables',
                'Chapter 9 tables are essential for daily HVAC electrical work. '
                'Table 310.16 (conductor ampacities) is used to size every HVAC '
                'circuit. Table 310.16 has 60°C, 75°C, and 90°C temperature columns '
                '— use 60°C column for sizing most residential wiring; 75°C for '
                'commercial wiring to equipment with 75°C-rated terminals. '
                'Tables 1 through 7 of Chapter 9 determine conduit fill for '
                'all conductor combinations. Table 250.122 sizes equipment '
                'grounding conductors based on overcurrent device rating.')]),
    ]:
        pid = _ch(conn, bid, ch)
        if pid:
            _ins(conn, bid, pid, secs)


# ── OSHA (29 CFR 1926 - Construction Industry Standards) ─────────

def _seed_osha(conn, bid):
    # ── Chapter content (depth=0) ──────────────────────────────────
    _update_content(conn, bid, 'A',
        'Subpart A establishes the general scope and purpose of 29 CFR 1926 OSHA '
        'Construction Industry Standards. These regulations apply to all construction '
        'work including HVAC installation, and failure to comply can result in '
        'fines, stop-work orders, and criminal liability. HVAC contractors must '
        'have a written safety program and must assign a competent person to each '
        'job site to identify and correct hazards.')
    _update_content(conn, bid, 'B',
        'Subpart B provides general interpretations of OSHA construction standards '
        'including definitions of "construction work," employer responsibilities, '
        'and the obligation to comply with the more specific standard when multiple '
        'standards apply. HVAC contractors are employers under OSHA and are responsible '
        'for the safety of their employees even when working as subcontractors on '
        'a GC-managed project.')
    _update_content(conn, bid, 'C',
        'Subpart C establishes general safety and health provisions applicable to all '
        'construction work. Employers must initiate and maintain accident prevention '
        'programs. Frequent and regular job site inspections are required. No employee '
        'may be exposed to unsafe or unhealthy working conditions. HVAC contractors '
        'must conduct pre-task safety analysis (JSA) for hazardous operations including '
        'rooftop work, confined space entry, and gas line work.')
    _update_content(conn, bid, 'D',
        'Subpart D covers occupational health and environmental controls including medical '
        'services, sanitation, illumination, gases, vapors, and toxic substances. HVAC '
        'contractors must be aware of lead exposure from disturbing old duct insulation, '
        'asbestos in existing mechanical systems, and refrigerant exposure during leak '
        'testing and recovery. Personal exposure monitoring is required when exposure '
        'above the action level is suspected.')
    _update_content(conn, bid, 'E',
        'Subpart E covers personal protective equipment (PPE) including head protection '
        '(hard hats), eye and face protection (safety glasses, goggles, face shields), '
        'hearing protection, and hand and foot protection. HVAC contractors must conduct '
        'a written hazard assessment to determine required PPE for each work task. '
        'Employers must provide PPE at no cost to employees per 29 CFR 1926.95(d).')
    _update_content(conn, bid, 'F',
        'Subpart F covers fire protection and prevention on construction sites. HVAC '
        'contractors performing brazing and soldering operations must follow hot work '
        'permit procedures. A fire watch must be maintained during and for 30 minutes '
        'after hot work. Fire extinguishers must be within 100 feet travel distance. '
        'Compressed gas cylinders must be stored and handled per Section 1926.350.')
    _update_content(conn, bid, 'G',
        'Subpart G covers signs, signals, and barricades required during construction. '
        'HVAC contractors working in areas accessible to the public or other trades '
        'must barricade hazardous areas and post warning signs. This includes rooftop '
        'work areas, areas where overhead work creates falling object hazards, and '
        'areas where refrigerant or gas work creates exposure risks.')
    _update_content(conn, bid, 'H',
        'Subpart H covers materials handling, storage, use, and disposal. HVAC '
        'contractors must safely handle heavy equipment (rooftop units, boilers, '
        'air handlers) using appropriate rigging, cranes, or mechanical lifting '
        'equipment. Refrigerant cylinders must be stored upright, secured against '
        'tipping, and away from heat sources. Hazardous materials must have Safety '
        'Data Sheets (SDS) available on site.')
    _update_content(conn, bid, 'I',
        'Subpart I covers hand and power tools safety requirements. HVAC contractors '
        'use power tools including reciprocating saws, angle grinders, sheet metal '
        'shears, hydraulic press fittings, and impact drivers. All power tools must '
        'be maintained in safe condition with guards in place. Ground fault circuit '
        'interrupters (GFCI) are required for all temporary power tools on construction '
        'sites per Section 1926.404(b)(1)(ii).')
    _update_content(conn, bid, 'J',
        'Subpart J covers welding and cutting, including oxygen-acetylene brazing and '
        'soldering operations critical to HVAC work. Brazers must have adequate '
        'ventilation and eye protection (minimum shade 5 filter lens). Fire watch '
        'per Section 1926.352 is required. Compressed gas cylinders must be '
        'protected from damage and stored separately (oxygen from fuel gases by '
        '20 feet or a 5-foot fire wall). Cylinder caps must be in place when '
        'cylinders are not in use.')
    _update_content(conn, bid, 'K',
        'Subpart K covers electrical safety during construction, including temporary '
        'power systems, GFCI requirements, assured equipment grounding programs, and '
        'lockout/tagout procedures. HVAC contractors must use GFCI protection for '
        'all 120V temporary power tools. Before working on energized electrical '
        'equipment, a lockout/tagout procedure per 29 CFR 1910.147 must be followed. '
        'Working on live electrical circuits requires documented justification and '
        'appropriate PPE (arc flash rated).')
    _update_content(conn, bid, 'L',
        'Subpart L covers scaffold requirements. HVAC contractors frequently use '
        'scaffolds for ductwork installation in large commercial spaces. Scaffolds '
        'must be designed and erected by competent persons. Load capacity must '
        'not be exceeded. Platforms must be fully planked. Fall protection is '
        'required on scaffolds over 10 feet per Section 1926.502(b). Daily '
        'scaffold inspections by a competent person are required.')
    _update_content(conn, bid, 'M',
        'Subpart M covers fall protection, which is the leading cause of construction '
        'fatalities. Fall protection is required for all work at heights of 6 feet '
        'or more above a lower level. HVAC contractors working on rooftops must use '
        'guardrails, safety nets, or personal fall arrest systems. Leading edge work '
        'and work near unprotected roof edges require specific fall protection plans. '
        'Training on fall hazards and protection methods is required for all '
        'employees exposed to fall hazards.')
    _update_content(conn, bid, 'N',
        'Subpart N covers cranes, hoists, elevators, and conveyors used in construction. '
        'HVAC contractors frequently use cranes to set rooftop equipment and mobile '
        'elevating work platforms (scissors lifts, boom lifts) for overhead work. '
        'Crane operators must be certified per NCCCO or equivalent. Rigging must '
        'be performed by a qualified rigger. A competent person must inspect crane '
        'equipment before each shift.')
    _update_content(conn, bid, 'O',
        'Subpart O covers motor vehicles and mechanized equipment on construction sites. '
        'HVAC contractors using forklifts, telehandlers, and other powered industrial '
        'trucks must have trained and certified operators. Equipment must be inspected '
        'before each shift. Reverse alarms are required on vehicles operating in '
        'reverse. Seatbelt use is mandatory. No passengers are permitted on equipment '
        'not designed for passengers.')
    _update_content(conn, bid, 'P',
        'Subpart P covers excavation safety. HVAC contractors excavating for underground '
        'gas piping, hydronic piping, refrigerant lines, and condensate drainage must '
        'comply with Section 1926.651 (General Requirements) and 1926.652 (Excavation '
        'Requirements). All excavations over 5 feet deep must be shored, sloped, or '
        'protected by a trench box. A competent person must classify soil type before '
        'designing protection. Oklahoma\'s clay soils typically require sloping or '
        'benching because of the high moisture-induced instability.')
    _update_content(conn, bid, 'Q',
        'Subpart Q covers concrete and masonry construction. HVAC contractors working '
        'around concrete pours (embedding conduit or sleeves) must comply with concrete '
        'formwork requirements. Masonry wall construction areas must be barricaded '
        'during construction. Core drilling through concrete and masonry requires '
        'eye protection and control of silica dust per Subpart Z Table 1.')
    _update_content(conn, bid, 'R',
        'Subpart R covers steel erection. HVAC contractors following steel erectors '
        'to install ductwork and equipment on structural steel must comply with '
        'fall protection requirements for structural steel work. Decking must be '
        'fully secured before HVAC work proceeds above. Safety nets or personal '
        'fall arrest systems are required for work at heights.')
    _update_content(conn, bid, 'S',
        'Subpart S covers underground construction, confined spaces, and compressed '
        'air work. HVAC contractors working in equipment rooms, boiler rooms, storage '
        'tanks, or underground utility vaults may be in permit-required confined '
        'spaces. A written confined space entry program is required. Atmospheric '
        'testing for oxygen, flammable gases, and toxic substances is required '
        'before entry. A trained attendant must monitor the entrant.')
    _update_content(conn, bid, 'T',
        'Subpart T covers demolition. HVAC contractors removing existing mechanical '
        'systems must follow demolition sequencing to prevent unexpected structural '
        'failure. Gas lines must be disconnected by the utility before demolition '
        'proceeds. Refrigerant must be recovered before cutting refrigerant piping. '
        'Asbestos-containing materials in old duct insulation require abatement '
        'before demolition by licensed asbestos abatement contractors.')
    _update_content(conn, bid, 'U',
        'Subpart U covers blasting and explosives, which HVAC contractors rarely '
        'encounter directly. However, HVAC contractors must coordinate with blasting '
        'operations on sites where rock excavation is occurring. Blasting vibration '
        'can displace installed mechanical equipment. A competent blaster must provide '
        'notification to all trades before detonation.')
    _update_content(conn, bid, 'V',
        'Subpart V covers electrical power transmission and distribution work. '
        'HVAC contractors must maintain minimum approach distances from energized '
        'overhead power lines per Table V-7 — for lines up to 50kV, minimum '
        '10-foot clearance is required. Cranes setting rooftop HVAC equipment '
        'near power lines must follow Subpart CC requirements for crane operation '
        'near energized lines.')
    _update_content(conn, bid, 'W',
        'Subpart W covers rollover protective structures (ROPS) for construction '
        'equipment. Forklifts and telehandlers used by HVAC contractors to move '
        'heavy equipment must have ROPS per Section 1926.1001. All equipment '
        'operators must use seatbelts when ROPS-equipped equipment is operating. '
        'ROPS must not be removed or modified without engineering approval.')
    _update_content(conn, bid, 'X',
        'Subpart X covers stairways and ladders, which are essential tools for HVAC '
        'contractors. Section 1926.1053 requires that portable ladders extend at '
        'least 3 feet above the upper landing. Ladders must be set at a 4:1 angle '
        '(75.5 degrees from horizontal). Metal ladders are prohibited in areas with '
        'electrical hazards. HVAC contractors working from ladders are subject to '
        'fall protection requirements if working at heights of 6 feet or more.')
    _update_content(conn, bid, 'Z',
        'Subpart Z covers toxic and hazardous substances including lead, asbestos, '
        'silica, and chemical specific exposure limits (PELs). HVAC contractors '
        'may encounter lead in old soldered pipe joints and paint, asbestos in '
        'old duct insulation and pipe wrap, and silica dust from concrete drilling. '
        'Section 1926.62 (lead) requires medical surveillance, air monitoring, '
        'hygiene, and respiratory protection when exposure exceeds the action level '
        'of 30 µg/m³. Section 1926.1101 covers asbestos.')
    _update_content(conn, bid, 'AA',
        'Subpart AA is reserved in 29 CFR 1926. No active OSHA construction regulations '
        'are published under this subpart. When researching OSHA requirements, contractors '
        'should be aware that the subpart lettering system skips some letters and that '
        'state plan states (including those with state OSHA programs) may have additional '
        'requirements beyond the federal standard. Oklahoma operates under federal OSHA '
        'jurisdiction, not a state plan.')
    _update_content(conn, bid, 'CC',
        'Subpart CC covers cranes and derricks in construction, which replaced the '
        'older Subpart N crane provisions. HVAC contractors using cranes to set '
        'rooftop equipment — common practice for large commercial projects — must '
        'ensure crane operators are certified per Section 1926.1427. A qualified '
        'rigger must rig the load. A signal person must be used when the operator '
        'cannot see the load. Power line safety distances per Section 1926.1408 '
        'must be maintained — 20-foot minimum for lines up to 350kV during assembly '
        'and disassembly, 10-foot minimum during operations.')

    # ── Depth=1 sections ───────────────────────────────────────────
    for ch, secs in [
        ('A', [('1926.1', 'Purpose and Scope',
                '29 CFR 1926 prescribes mandatory safety and health standards for the '
                'construction industry. Section 1926.1 applies these standards to all '
                'construction, alteration, repair, painting, decorating, and demolition '
                'work. HVAC installation and service work on construction projects is '
                'covered under these standards. Employers who violate these standards '
                'are subject to citations, fines up to $15,625 per willful or repeat '
                'violation, and possible criminal prosecution for fatalities. Every '
                'HVAC contractor must have a written safety and health program per '
                'Section 1926.20(b).'),
               ('1926.6', 'Incorporation by Reference',
                'Section 1926.6 incorporates by reference numerous consensus standards '
                'from ANSI, NFPA, ASTM, and ACGIH that are enforceable as OSHA regulations. '
                'For HVAC work, important incorporated standards include: ANSI Z87.1 '
                '(eye protection), ANSI Z89.1 (head protection), NFPA 51B (welding '
                'and cutting fire prevention), and ACGIH TLVs for chemical exposure. '
                'Violating an incorporated standard is the same as violating a direct '
                'OSHA regulation.')]),
        ('B', [('1926.10', 'Scope of Subpart',
                'Section 1926.10 provides general interpretations of the construction '
                'industry standards. "Construction work" includes new construction, '
                'alteration, repair, and demolition of buildings and structures including '
                'mechanical systems. Both the general contractor and all subcontractors '
                'are employers under OSHA and each is responsible for their own employees\' '
                'safety. Multi-employer citation policy allows OSHA to cite both creating '
                'and exposing employers at multi-employer worksites.')]),
        ('C', [('1926.20', 'General Safety Provisions',
                'Section 1926.20 requires each employer to initiate and maintain programs '
                'for frequent and regular inspection of job sites, materials, and equipment '
                'by competent persons designated by the employer. No employee shall be '
                'required to work under conditions that are unsanitary, hazardous, or '
                'dangerous to health or safety. HVAC contractors must designate a '
                'competent person who can identify hazards and has authority to take '
                'corrective action. Job Hazard Analysis (JHA) forms are the standard '
                'tool for pre-task safety planning on HVAC projects.'),
               ('1926.21', 'Safety Training',
                'Section 1926.21 requires employers to instruct each employee in the '
                'recognition and avoidance of unsafe conditions and in the regulations '
                'applicable to the work environment to control or eliminate any hazards. '
                'Training must be provided in a language and vocabulary the employee '
                'understands. Specific training requirements for HVAC work include: '
                'fall protection (before exposure), confined space entry (before entry), '
                'hazardous energy control/lockout-tagout, and respiratory protection. '
                'Training records must be maintained and available for OSHA inspection.'),
               ('1926.28', 'Personal Protective Equipment',
                'Section 1926.28 requires the employer to ensure that employees use '
                'appropriate personal protective equipment in all operations where there '
                'is exposure to hazardous conditions. Section 1926.95(d) requires the '
                'employer to pay for required PPE at no cost to employees. A written '
                'PPE hazard assessment per Section 1926.95(b) must be performed and '
                'certified. For HVAC work, typical required PPE includes: hard hats, '
                'safety glasses, work gloves, steel-toed boots, and high-visibility '
                'vests on active roadway or heavy equipment sites.')]),
        ('D', [('1926.50', 'Medical Services',
                'Section 1926.50 requires first aid services to be available at '
                'construction job sites. A first aid kit per ANSI Z308.1 must be '
                'stocked and accessible. At least one person on each shift must '
                'be trained in first aid and CPR when no infirmary or physician is '
                'reasonably accessible. Eye wash stations per ANSI Z358.1 are '
                'required where the eyes may be exposed to corrosive materials — '
                'refrigerant handling areas and chemical treatment rooms require '
                'emergency eye wash facilities.'),
               ('1926.51', 'Sanitation',
                'Section 1926.51 requires potable drinking water, toilet facilities '
                '(1 per 20 employees, not shared with females unless individual '
                'locking rooms), and washing facilities. Enclosed job sites must '
                'have adequate ventilation to maintain safe breathing air. For HVAC '
                'work inside buildings during construction, this means maintaining '
                'ventilation adequate to dilute welding fumes, solvent vapors, and '
                'other construction contaminants.'),
               ('1926.55', 'Gases/Vapors/Dust',
                'Section 1926.55 requires employee exposures to airborne contaminants '
                'to remain below the permissible exposure limits (PELs) listed in '
                'Table Z-1. For HVAC contractors: lead PEL = 50 µg/m³, action level '
                '= 30 µg/m³; silica PEL = 50 µg/m³ as respirable crystalline '
                'silica per Section 1926.1153; welding fumes PEL = 5 mg/m³ for '
                'total particulate. Air monitoring is required when exposure at or '
                'above the action level is suspected. Local exhaust ventilation and '
                'respiratory protection controls exposures.'),
               ('1926.62', 'Lead',
                'Section 1926.62 covers lead exposure in construction. Action level '
                'is 30 µg/m³ (8-hour TWA); PEL is 50 µg/m³. Disturbing lead-based '
                'paint on existing HVAC ductwork and equipment in older buildings '
                'triggers Section 1926.62 requirements including initial exposure '
                'determination, engineering controls, hygiene practices, medical '
                'surveillance, and protective clothing. EPA Lead RRP Rule applies '
                'to pre-1978 residential dwellings — contractors must be EPA '
                'Lead-Safe Certified.')]),
        ('E', [('1926.95', 'Criteria for PPE',
                'Section 1926.95 establishes the PPE program framework. A written '
                'PPE hazard assessment must be certified by a responsible manager. '
                'PPE must fit properly and be maintained in sanitary condition. '
                'Employees must be trained on proper use, donning/doffing, '
                'limitations, and care of each required PPE item. Training must '
                'be documented. HVAC-specific PPE assessments should address: '
                'heat stress from attic work in summer (Oklahoma attics can exceed '
                '140°F in summer), cold stress from outdoor work in winter, and '
                'chemical burns from refrigerants.'),
               ('1926.100', 'Head Protection',
                'Section 1926.100 requires hard hats (helmets) where employees '
                'are exposed to head injury from falling objects, impact, or '
                'electrical hazards. ANSI Z89.1 Type I or Type II; Class E '
                '(electrical — tested to 20,000V) for work near electrical hazards. '
                'HVAC contractors must wear hard hats on active construction sites '
                'when other trades are working overhead. Section 1926.100(c) '
                'requires employers to provide hard hats that meet ANSI Z89.1.'),
               ('1926.102', 'Eye/Face Protection',
                'Section 1926.102 requires eye and face protection per ANSI Z87.1 '
                'when employees are exposed to hazards from flying particles, '
                'molten metal, liquid chemicals, or radiation. HVAC-specific '
                'eye hazards: brazing and soldering (filter lens shade 5 minimum); '
                'refrigerant handling (safety goggles to prevent liquid refrigerant '
                'spray to eyes); grinding and cutting (safety glasses with side '
                'shields, or goggles); spray painting or chemical application '
                '(chemical splash goggles).'),
               ('1926.104', 'Safety Belts/Nets',
                'Section 1926.104 is superseded by the more comprehensive Subpart M '
                'fall protection requirements for general construction. For HVAC '
                'contractors, fall protection is required at 6 feet above a lower '
                'level. Rooftop HVAC work is one of the highest fall hazard '
                'activities in HVAC contracting. Personal fall arrest systems '
                '(harness, lanyard, anchor) are required when guardrails and safety '
                'nets are not feasible.')]),
        ('F', [('1926.150', 'Fire Protection',
                'Section 1926.150 requires portable fire extinguishers within 100 '
                'feet of travel distance for hazardous areas, and within 100 feet '
                'or one per each 3,000 sq ft of ground floor for other areas. '
                'Fire extinguishers must be the appropriate type: Class ABC for '
                'general construction, Class D for metal fires (magnesium, titanium). '
                'HVAC contractors performing brazing must have a fire extinguisher '
                'immediately accessible. Hot work permits are required on most '
                'commercial job sites.'),
               ('1926.152', 'Flammable Liquids',
                'Section 1926.152 regulates storage and handling of flammable and '
                'combustible liquids on construction sites. Gasoline, solvents, '
                'and flux are flammable liquids HVAC contractors commonly use. '
                'Storage containers must be approved safety cans per UL 30. '
                'Maximum 25 gallons of flammable liquids may be stored in a '
                'work area. No smoking within 50 feet of fuel storage. '
                'Refrigerants are not flammable liquids (except A2 and A3 '
                'class refrigerants which require special handling per '
                'ASHRAE 15 and NFPA 55.')]),
        ('G', [('1926.200', 'Accident Prevention Signs',
                'Section 1926.200 requires accident prevention signs and tags at '
                'construction sites. DANGER signs (red/black/white) for immediate '
                'hazards; CAUTION signs (yellow/black) for possible hazards; '
                'SAFETY INSTRUCTION signs (green/white) for general instruction. '
                'HVAC contractors must post signs at open trenches, overhead work '
                'areas, and areas with refrigerant exposure hazards. Barricades '
                'per Section 1926.202 must surround excavations and elevated '
                'work areas accessible to the public.')]),
        ('H', [('1926.250', 'Materials Handling',
                'Section 1926.250 requires safe storage of materials with '
                'consideration for fire hazards, drainage, and access. HVAC '
                'sheet metal and equipment must be stored to prevent tipping '
                'and falling. Refrigerant cylinders must be stored upright, '
                'chained or strapped, away from heat sources. Section 1926.251 '
                'covers rigging equipment for material handling — slings, hooks, '
                'and rigging hardware must be rated for the load and inspected '
                'before each use.')]),
        ('I', [('1926.300', 'General Requirements — Tools',
                'Section 1926.300 requires that all hand and power tools be '
                'maintained in safe condition. Guards on power tools must remain '
                'in place — removing guards is a willful violation. Section '
                '1926.302 covers power hand tools: double insulated or grounded '
                'tools required. Section 1926.304 covers woodworking tools. '
                'HVAC contractors commonly use reciprocating saws (Sawzall), '
                'angle grinders, press fittings tools, and sheet metal tools — '
                'all must have guards and be GFCI-protected when plugged in.')]),
        ('J', [('1926.350', 'Gas Welding/Cutting',
                'Section 1926.350 covers storage, handling, and use of compressed '
                'gas cylinders for welding and cutting. Oxygen and fuel gas cylinders '
                'must be stored separately by at least 20 feet or a 5-foot fire '
                'wall (1/2-hour rated). Cylinder caps must be in place when '
                'regulators are not attached. Cylinders must not be stored near '
                'heat or subject to impact. Torches and hoses must be inspected '
                'for leaks using soap solution — never use open flame to test '
                'for leaks. Backflow preventers and flashback arrestors '
                'are required on oxygen-fuel hoses.'),
               ('1926.352', 'Fire Prevention',
                'Section 1926.352 requires fire prevention measures during welding, '
                'cutting, and brazing operations. Combustibles must be moved or '
                'shielded before hot work begins. A fire watch must be maintained '
                'during and for 30 minutes after hot work. If a fire watch is '
                'required but cannot be maintained, hot work must stop. HVAC '
                'contractors brazing refrigerant piping inside buildings must '
                'use written hot work permits on most commercial job sites. '
                'Thermal insulation and combustible blocking must be removed '
                'from the brazing area or shielded with fire-resistant materials.')]),
        ('K', [('1926.400', 'Electrical — General',
                'Subpart K covers temporary electrical systems on construction sites. '
                'Section 1926.403 requires all electrical equipment to be listed '
                'and labeled. Section 1926.404(b)(1)(ii) requires GFCI protection '
                'for all 120V temporary power receptacles. The assured equipment '
                'grounding conductor program (Section 1926.404(b)(1)(iii)) is an '
                'alternative to GFCI for some applications. HVAC contractors using '
                'electric tools during construction must use GFCI-protected circuits '
                'or assured grounding program procedures.')]),
        ('L', [('1926.450', 'Scaffolding — General',
                'Subpart L requires scaffolds to be capable of supporting their '
                'own weight plus four times the maximum intended load. Platforms '
                'must be fully planked or decked with no gaps exceeding 1 inch. '
                'Guardrails (top rail 38-45 inches, midrail, toe board) are required '
                'on scaffold platforms more than 10 feet above the ground. HVAC '
                'contractors must use only erected scaffolds — no building on top '
                'of ladders or improvised elevated work platforms. A competent '
                'person must inspect scaffolds before each work shift.')]),
        ('M', [('1926.500', 'Fall Protection — General',
                'Subpart M requires fall protection for all construction work at '
                'heights of 6 feet or more above a lower level. Three acceptable '
                'systems: guardrails (top rail 39-45 inches), safety nets within '
                '30 feet below the work surface, or personal fall arrest systems '
                '(PFAS — full-body harness, connecting lanyard, and anchorage '
                'rated at 5,000 lb per employee). Section 1926.502(d) specifies '
                'PFAS requirements — the system must limit fall to 6 feet and '
                'arrest force to 1,800 lb. For HVAC rooftop work, a written '
                'fall protection plan per Section 1926.502(k) is required when '
                'conventional fall protection is not feasible.')]),
        ('N', [('1926.550', 'Cranes and Derricks',
                'Subpart N crane requirements have largely been superseded by '
                'the more comprehensive Subpart CC, but Section 1926.550 still '
                'covers some crane operations. HVAC contractors hiring crane '
                'services to set rooftop equipment must verify the crane operator '
                'is certified per Subpart CC, the crane has been inspected, and '
                'a qualified rigger designs the rigging lift. Pre-lift safety '
                'meetings are standard practice. Overhead power line clearances '
                'must be verified and maintained throughout the lift.')]),
        ('O', [('1926.600', 'Motor Vehicles',
                'Section 1926.600 requires motor vehicles and mechanized equipment '
                'to have seatbelts, rollover protection, and be operated only by '
                'trained operators. HVAC contractors using forklifts and telehandlers '
                'must have operators trained and certified per OSHA 1910.178(l) '
                '(powered industrial trucks). Equipment must be inspected before '
                'each shift using manufacturer checklist. No passengers unless '
                'the equipment is designed for passengers.')]),
        ('P', [('1926.651', 'Excavation Requirements',
                'Section 1926.651 requires excavations to be inspected by a '
                'competent person before entry and after rainstorms. Underground '
                'utilities must be located and marked before excavating (call '
                '811 — Oklahoma One Call). Excavated materials (spoil) must be '
                'kept minimum 2 feet from the edge of the excavation. Structural '
                'ramps for equipment access must be designed. All excavations '
                'deeper than 4 feet require a means of safe egress within 25 '
                'feet of travel distance.'),
               ('1926.652', 'Sloping/Shoring',
                'Section 1926.652 requires all excavations deeper than 5 feet '
                'to be sloped, shored, or protected by a trench box. Soil must '
                'be classified by a competent person as Type A (stable), Type B, '
                'or Type C (unstable) per Appendix B. Oklahoma clay is generally '
                'Type B except when fissured, layered, or wet (then Type C). '
                'Type C soil requires 1.5H:1V minimum slope. Trench boxes must '
                'be sized for the excavation depth and soil type.')]),
        ('Q', [('1926.700', 'Concrete and Masonry',
                'Subpart Q covers concrete construction. HVAC contractors embedding '
                'conduit and sleeves in concrete pours must coordinate with the '
                'concrete contractor. Section 1926.703 requires shoring formwork '
                'to be designed by qualified personnel. Concrete mixing and '
                'placement workers are exposed to wet concrete alkalinity (pH '
                '12-13) — skin and eye protection are required. Core drilling '
                'through hardened concrete generates silica dust — wet methods '
                'or vacuum collection is required per Section 1926.1153.')]),
        ('R', [('1926.750', 'Steel Erection',
                'Subpart R covers structural steel erection. HVAC contractors '
                'following steel erectors must comply with Subpart R requirements '
                'until the structure is plumbed, bolted, and decked. Fall protection '
                'for HVAC work on structural steel requires a site-specific fall '
                'protection plan. Personnel must not work beneath suspended steel '
                'loads. Connectors (employees connecting structural steel) have '
                'specific positioning and protection requirements per Section '
                '1926.756.')]),
        ('S', [('1926.800', 'Underground Construction',
                'Subpart S covers underground construction and confined spaces. '
                'HVAC mechanical rooms, boiler rooms, and underground utility '
                'vaults may qualify as permit-required confined spaces under '
                '29 CFR 1910.146. A written confined space entry program must '
                'define spaces, classify them, and establish entry procedures. '
                'Atmospheric monitoring for oxygen (19.5-23.5% acceptable), '
                'flammable gases (<10% LEL), and toxic vapors is required before '
                'entry. A trained attendant must maintain continuous communication '
                'with the entrant.')]),
        ('T', [('1926.850', 'Demolition — General',
                'Section 1926.850 requires a written engineering survey before '
                'demolition begins to determine condition of structural elements. '
                'All gas, electric, water, and mechanical services must be '
                'disconnected or controlled before demolition begins. Refrigerant '
                'must be recovered per EPA Section 608 before cutting refrigerant '
                'piping. Asbestos surveys per NESHAP (EPA 40 CFR Part 61) are '
                'required before demolition of buildings containing ACM (asbestos-'
                'containing materials) including pipe insulation, duct insulation, '
                'and floor tiles.')]),
        ('U', [('1926.900', 'Blasting — General',
                'Subpart U covers explosives used in construction blasting. HVAC '
                'contractors are generally not involved in blasting operations '
                'but must be aware of blasting schedules on construction sites '
                'and maintain safe distances. Section 1926.900(k) prohibits '
                'anyone other than authorized blasters from handling explosives. '
                'Blasting vibration may affect freshly installed HVAC connections — '
                'coordinate with the blaster regarding timing relative to '
                'pressure tests and equipment commissioning.')]),
        ('V', [('1926.950', 'Power Transmission — General',
                'Subpart V covers work near electrical power transmission and '
                'distribution lines. Section 1926.960 establishes minimum approach '
                'distances for unqualified workers: 10 feet for lines up to 50kV. '
                'Cranes and equipment must maintain these clearances throughout '
                'operation. HVAC contractors setting rooftop equipment with cranes '
                'must verify power line locations and heights with the utility before '
                'the lift. Insulated barriers or utility de-energization may be '
                'required when clearances cannot be maintained.')]),
        ('W', [('1926.1000', 'ROPS',
                'Subpart W requires rollover protective structures (ROPS) and '
                'overhead protection for certain construction equipment. All '
                'equipment with ROPS must also have seatbelts that are used '
                'by operators. Forklifts and telehandlers used by HVAC contractors '
                'must have ROPS and operators must use seatbelts. Section 1926.1002 '
                'covers overhead protection for equipment in areas where objects '
                'could fall onto the operator.')]),
        ('X', [('1926.1050', 'Stairways and Ladders',
                'Section 1926.1053 requires portable ladders to: extend 3 feet '
                'above the upper landing surface; be secured at top and bottom '
                'when possible; be set at 75.5-degree angle (4:1 rule — 1 foot '
                'out for every 4 feet of height); have non-conductive side rails '
                'near electrical work; and support 4 times the maximum intended load. '
                'Section 1926.1060 requires training on hazard recognition and '
                'safe use of ladders. HVAC contractors use ladders for the majority '
                'of elevated work and ladder falls are a significant injury source.')]),
        ('Z', [('1926.1100', 'Toxic Substances — General',
                'Subpart Z covers specific toxic and hazardous substance standards. '
                'Key sections for HVAC contractors: Section 1926.1101 (Asbestos) — '
                'ACM in thermal system insulation requires air monitoring, respirators '
                '(minimum P100), and disposal per EPA/state regulations; Section '
                '1926.62 (Lead) — lead paint on older equipment requires full PPE '
                'and medical surveillance; Section 1926.1153 (Silica) — concrete '
                'cutting and core drilling generates crystalline silica requiring '
                'Table 1 engineering controls or air monitoring above the PEL '
                'of 50 µg/m³.')]),
        ('CC', [('1926.1400', 'Cranes — General',
                 'Subpart CC establishes comprehensive requirements for crane and '
                 'derrick operations in construction, superseding most of Subpart N. '
                 'Section 1926.1427 requires crane operators to be certified by an '
                 'accredited crane operator testing organization (NCCCO, NCCER) or '
                 'qualified by an audited employer program. Section 1926.1412 '
                 'requires daily equipment inspections before use. HVAC contractors '
                 'using crane services to set rooftop air handlers, cooling towers, '
                 'and chillers must verify operator certification and crane '
                 'inspection documentation. Section 1926.1408 power line clearances '
                 'must be maintained throughout the lift operation.')]),
    ]:
        pid = _ch(conn, bid, ch)
        if pid:
            _ins(conn, bid, pid, secs)
