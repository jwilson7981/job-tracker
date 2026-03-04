"""
Seed script for equipment_manuals table.

Populates the database with equipment manual records for HVAC equipment
from Lennox, Allied, and ADP — the primary manufacturers used by LGHVAC LLC.

Each entry is a URL reference to manufacturer documentation (no file uploads).

Usage:
    python seed_manuals.py
"""

import sqlite3
import os


def seed_equipment_manuals(conn):
    """Insert comprehensive equipment manual records into equipment_manuals.

    Re-running is safe: each record is checked by (manufacturer, model_number,
    manual_type) before insertion, so no duplicates are created.

    Args:
        conn: An open sqlite3 connection to the database.
    """
    manuals = []

    # ------------------------------------------------------------------
    # Real manufacturer documentation portal URLs
    # ------------------------------------------------------------------
    LENNOX_DOCS = "https://www.lennoxpros.com/documentlibrary"
    LENNOX_COMMERCIAL = "https://www.lennox.com/commercial/resources/product-documentation"
    ADP_DOCS = "https://www.adpnow.com/product-literature/"

    COMMERCIAL_MODELS = {
        'LGH', 'LGX', 'LGT', 'LGA', 'LGB', 'LGE',
        'KGA', 'KGB', 'KCA', 'KCB', 'KHE',
        'ZGA', 'ZHA', 'TSA',
        'LCA', 'LHA', 'LS25',
        'VRC', 'VRF', 'CBA', 'FBA', 'DBA',
        'Prodigy M3',
    }

    # ------------------------------------------------------------------
    # Manufacturer support URLs for new brands
    # ------------------------------------------------------------------
    BRAND_URLS = {
        'Lennox': LENNOX_DOCS,
        'Allied': LENNOX_DOCS,
        'ADP': ADP_DOCS,
        'Trane': 'https://www.trane.com/residential/en/resources/product-literature/',
        'Carrier': 'https://www.carrier.com/residential/en/us/resources/product-literature/',
        'Goodman': 'https://www.goodmanmfg.com/resources/library',
        'Daikin': 'https://www.daikincomfort.com/resources/literature',
        'Rheem': 'https://www.rheem.com/resources/literature-library/',
        'Ruud': 'https://www.ruud.com/resources/literature-library/',
        'York': 'https://www.york.com/residential-equipment/resources/product-literature',
        'Mitsubishi': 'https://www.mitsubishicomfort.com/resources/document-library',
        'Fujitsu': 'https://www.fujitsugeneral.com/us/support/downloads/index.html',
        'LG': 'https://www.lg.com/us/support/products/',
        'Samsung': 'https://www.samsung.com/us/support/',
        'Bosch': 'https://www.bosch-thermotechnology.us/us/en/residential/support/literature/',
        'Amana': 'https://www.amana-hac.com/resources/library',
        'Bryant': 'https://www.bryant.com/en/us/resources/product-literature/',
        'Payne': 'https://www.payne.com/en/us/resources/product-literature/',
        'Heil': 'https://www.?"heil-?"hvac.com/resources/literature/',
        'Tempstar': 'https://www.?"tempstar.com/resources/literature/',
        'Comfortmaker': 'https://www.?"comfortmaker.com/resources/literature/',
        'Day & Night': 'https://www.?"?"?"daynnight.com/resources/',
    }
    # Clean up URL placeholders (strip ? characters)
    BRAND_URLS = {k: v.replace('?', '') for k, v in BRAND_URLS.items()}

    # ------------------------------------------------------------------
    # Helper — auto-resolves URL to the correct documentation portal
    # Supports new fields: brand, equipment_type, tonnage, fuel_type, tags
    # ------------------------------------------------------------------
    def add(manufacturer, model, manual_type, title, url=None,
            brand='', equipment_type='', tonnage='', fuel_type='', tags=''):
        if url is None or '/documents/' in url or '/resources/' in url:
            if manufacturer == 'ADP':
                url = ADP_DOCS
            elif manufacturer == 'Lennox' and model in COMMERCIAL_MODELS:
                url = LENNOX_COMMERCIAL
            elif manufacturer in BRAND_URLS:
                url = BRAND_URLS[manufacturer]
            else:
                url = LENNOX_DOCS
        if not brand:
            brand = manufacturer
        manuals.append((manufacturer, model, manual_type, title, url,
                        brand, equipment_type, tonnage, fuel_type, tags))

    # ==================================================================
    #  LENNOX  — Residential Split-System Air Conditioners
    # ==================================================================

    # XC25 — top-tier variable-capacity AC
    add("Lennox", "XC25", "Installation",
        "XC25 Variable-Capacity Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC25-installation-guide")
    add("Lennox", "XC25", "Service",
        "XC25 Variable-Capacity Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC25-service-manual")
    add("Lennox", "XC25", "Wiring",
        "XC25 Variable-Capacity Air Conditioner Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/XC25-wiring-diagram")

    # XC21
    add("Lennox", "XC21", "Installation",
        "XC21 Two-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC21-installation-guide")
    add("Lennox", "XC21", "Service",
        "XC21 Two-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC21-service-manual")

    # XC17
    add("Lennox", "XC17", "Installation",
        "XC17 Two-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC17-installation-guide")
    add("Lennox", "XC17", "Service",
        "XC17 Two-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC17-service-manual")

    # XC16
    add("Lennox", "XC16", "Installation",
        "XC16 Two-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC16-installation-guide")
    add("Lennox", "XC16", "Service",
        "XC16 Two-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC16-service-manual")

    # XC15
    add("Lennox", "XC15", "Installation",
        "XC15 Single-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC15-installation-guide")
    add("Lennox", "XC15", "Service",
        "XC15 Single-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC15-service-manual")

    # XC13
    add("Lennox", "XC13", "Installation",
        "XC13 Single-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XC13-installation-guide")
    add("Lennox", "XC13", "Service",
        "XC13 Single-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XC13-service-manual")

    # 14ACX
    add("Lennox", "14ACX", "Installation",
        "14ACX Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/14ACX-installation-guide")
    add("Lennox", "14ACX", "Service",
        "14ACX Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/14ACX-service-manual")

    # 13ACX
    add("Lennox", "13ACX", "Installation",
        "13ACX Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/13ACX-installation-guide")
    add("Lennox", "13ACX", "Service",
        "13ACX Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/13ACX-service-manual")

    # 16ACXM — Merit Series AC
    add("Lennox", "16ACXM", "Installation",
        "16ACXM Merit Series Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/16ACXM-installation-guide")
    add("Lennox", "16ACXM", "Service",
        "16ACXM Merit Series Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/16ACXM-service-manual")

    # 15GCSX — Single-Stage AC
    add("Lennox", "15GCSX", "Installation",
        "15GCSX Single-Stage Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/15GCSX-installation-guide")
    add("Lennox", "15GCSX", "Service",
        "15GCSX Single-Stage Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/15GCSX-service-manual")

    # ==================================================================
    #  LENNOX  — Residential Heat Pumps
    # ==================================================================

    # XP25 — top-tier variable-capacity heat pump
    add("Lennox", "XP25", "Installation",
        "XP25 Variable-Capacity Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XP25-installation-guide")
    add("Lennox", "XP25", "Service",
        "XP25 Variable-Capacity Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XP25-service-manual")
    add("Lennox", "XP25", "Wiring",
        "XP25 Variable-Capacity Heat Pump Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/XP25-wiring-diagram")

    # XP21
    add("Lennox", "XP21", "Installation",
        "XP21 Two-Stage Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XP21-installation-guide")
    add("Lennox", "XP21", "Service",
        "XP21 Two-Stage Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XP21-service-manual")

    # XP17
    add("Lennox", "XP17", "Installation",
        "XP17 Two-Stage Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XP17-installation-guide")
    add("Lennox", "XP17", "Service",
        "XP17 Two-Stage Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XP17-service-manual")

    # XP16
    add("Lennox", "XP16", "Installation",
        "XP16 Single-Stage Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XP16-installation-guide")
    add("Lennox", "XP16", "Service",
        "XP16 Single-Stage Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XP16-service-manual")

    # XP15
    add("Lennox", "XP15", "Installation",
        "XP15 Single-Stage Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/XP15-installation-guide")
    add("Lennox", "XP15", "Service",
        "XP15 Single-Stage Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/XP15-service-manual")

    # 14HPX
    add("Lennox", "14HPX", "Installation",
        "14HPX Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/14HPX-installation-guide")
    add("Lennox", "14HPX", "Service",
        "14HPX Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/14HPX-service-manual")

    # 16HPXM — Merit Series Heat Pump
    add("Lennox", "16HPXM", "Installation",
        "16HPXM Merit Series Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/16HPXM-installation-guide")
    add("Lennox", "16HPXM", "Service",
        "16HPXM Merit Series Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/16HPXM-service-manual")

    # ==================================================================
    #  LENNOX  — Gas Furnaces
    # ==================================================================

    # EL296V — high-efficiency two-stage variable-speed
    add("Lennox", "EL296V", "Installation",
        "EL296V Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/EL296V-installation-guide")
    add("Lennox", "EL296V", "Service",
        "EL296V Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/EL296V-service-manual")
    add("Lennox", "EL296V", "Wiring",
        "EL296V Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/EL296V-wiring-diagram")

    # EL296E
    add("Lennox", "EL296E", "Installation",
        "EL296E Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/EL296E-installation-guide")
    add("Lennox", "EL296E", "Service",
        "EL296E Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/EL296E-service-manual")

    # EL280
    add("Lennox", "EL280", "Installation",
        "EL280 Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/EL280-installation-guide")
    add("Lennox", "EL280", "Service",
        "EL280 Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/EL280-service-manual")

    # SL280V
    add("Lennox", "SL280V", "Installation",
        "SL280V Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/SL280V-installation-guide")
    add("Lennox", "SL280V", "Service",
        "SL280V Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/SL280V-service-manual")
    add("Lennox", "SL280V", "Wiring",
        "SL280V Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/SL280V-wiring-diagram")

    # ML296V
    add("Lennox", "ML296V", "Installation",
        "ML296V Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/ML296V-installation-guide")
    add("Lennox", "ML296V", "Service",
        "ML296V Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/ML296V-service-manual")

    # SL297NV — Ultra Low NOx Gas Furnace
    add("Lennox", "SL297NV", "Installation",
        "SL297NV Ultra Low NOx Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/SL297NV-installation-guide")
    add("Lennox", "SL297NV", "Service",
        "SL297NV Ultra Low NOx Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/SL297NV-service-manual")
    add("Lennox", "SL297NV", "Wiring",
        "SL297NV Ultra Low NOx Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/SL297NV-wiring-diagram")

    # EL195NE — Low NOx Gas Furnace
    add("Lennox", "EL195NE", "Installation",
        "EL195NE Low NOx Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/EL195NE-installation-guide")
    add("Lennox", "EL195NE", "Service",
        "EL195NE Low NOx Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/EL195NE-service-manual")
    add("Lennox", "EL195NE", "Wiring",
        "EL195NE Low NOx Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/EL195NE-wiring-diagram")

    # ML180E — Entry Gas Furnace
    add("Lennox", "ML180E", "Installation",
        "ML180E Entry-Level Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/ML180E-installation-guide")
    add("Lennox", "ML180E", "Service",
        "ML180E Entry-Level Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/ML180E-service-manual")

    # ==================================================================
    #  LENNOX  — Air Handlers / Coils
    # ==================================================================

    # CBX40UHV — variable-speed air handler
    add("Lennox", "CBX40UHV", "Installation",
        "CBX40UHV Variable-Speed Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/CBX40UHV-installation-guide")
    add("Lennox", "CBX40UHV", "Service",
        "CBX40UHV Variable-Speed Air Handler Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/CBX40UHV-service-manual")
    add("Lennox", "CBX40UHV", "Wiring",
        "CBX40UHV Variable-Speed Air Handler Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/CBX40UHV-wiring-diagram")

    # CBX32MV — multi-speed air handler
    add("Lennox", "CBX32MV", "Installation",
        "CBX32MV Multi-Speed Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/CBX32MV-installation-guide")
    add("Lennox", "CBX32MV", "Service",
        "CBX32MV Multi-Speed Air Handler Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/CBX32MV-service-manual")

    # CBX27UH — standard air handler
    add("Lennox", "CBX27UH", "Installation",
        "CBX27UH Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/CBX27UH-installation-guide")
    add("Lennox", "CBX27UH", "Parts",
        "CBX27UH Air Handler Parts List",
        "https://www.lennoxpros.com/documents/parts-lists/CBX27UH-parts-list")

    # CBA38MV — Cased Coil
    add("Lennox", "CBA38MV", "Installation",
        "CBA38MV Cased Evaporator Coil Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/CBA38MV-installation-guide")
    add("Lennox", "CBA38MV", "Parts",
        "CBA38MV Cased Evaporator Coil Parts List",
        "https://www.lennoxpros.com/documents/parts-lists/CBA38MV-parts-list")

    # CBA25UH — Cased Coil
    add("Lennox", "CBA25UH", "Installation",
        "CBA25UH Cased Evaporator Coil Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/CBA25UH-installation-guide")
    add("Lennox", "CBA25UH", "Parts",
        "CBA25UH Cased Evaporator Coil Parts List",
        "https://www.lennoxpros.com/documents/parts-lists/CBA25UH-parts-list")

    # ==================================================================
    #  LENNOX  — Ductless / Mini-Split Systems
    # ==================================================================

    # MLA — wall-mount mini-split indoor head
    add("Lennox", "MLA", "Installation",
        "MLA Mini-Split Wall-Mount Indoor Unit Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MLA-mini-split-installation-guide")
    add("Lennox", "MLA", "Service",
        "MLA Mini-Split Wall-Mount Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MLA-mini-split-service-manual")

    # MHA — high-wall mini-split indoor head
    add("Lennox", "MHA", "Installation",
        "MHA Mini-Split High-Wall Indoor Unit Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MHA-mini-split-installation-guide")
    add("Lennox", "MHA", "Service",
        "MHA Mini-Split High-Wall Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MHA-mini-split-service-manual")

    # MPC — multi-zone outdoor unit
    add("Lennox", "MPC", "Installation",
        "MPC Multi-Zone Mini-Split Outdoor Unit Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MPC-multi-zone-installation-guide")
    add("Lennox", "MPC", "Service",
        "MPC Multi-Zone Mini-Split Outdoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MPC-multi-zone-service-manual")
    add("Lennox", "MPC", "Wiring",
        "MPC Multi-Zone Mini-Split Outdoor Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/MPC-multi-zone-wiring-diagram")

    # MPB — Ductless Mini-Split outdoor unit
    add("Lennox", "MPB", "Installation",
        "MPB Ductless Mini-Split Outdoor Unit Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MPB-mini-split-installation-guide")
    add("Lennox", "MPB", "Service",
        "MPB Ductless Mini-Split Outdoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MPB-mini-split-service-manual")
    add("Lennox", "MPB", "Wiring",
        "MPB Ductless Mini-Split Outdoor Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/MPB-mini-split-wiring-diagram")

    # MPD — Ductless Ceiling Cassette indoor unit
    add("Lennox", "MPD", "Installation",
        "MPD Ductless Ceiling Cassette Indoor Unit Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MPD-ceiling-cassette-installation-guide")
    add("Lennox", "MPD", "Service",
        "MPD Ductless Ceiling Cassette Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MPD-ceiling-cassette-service-manual")

    # MS8 — Mini-Split Single Zone
    add("Lennox", "MS8", "Installation",
        "MS8 Mini-Split Single-Zone System Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/MS8-mini-split-installation-guide")
    add("Lennox", "MS8", "Service",
        "MS8 Mini-Split Single-Zone System Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/MS8-mini-split-service-manual")
    add("Lennox", "MS8", "Wiring",
        "MS8 Mini-Split Single-Zone System Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/MS8-mini-split-wiring-diagram")

    # ==================================================================
    #  LENNOX  — Commercial Rooftop Units
    # ==================================================================

    # LGH — large commercial rooftop
    add("Lennox", "LGH", "Installation",
        "LGH Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGH-rooftop-installation-guide")
    add("Lennox", "LGH", "Service",
        "LGH Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGH-rooftop-service-manual")
    add("Lennox", "LGH", "Wiring",
        "LGH Commercial Rooftop Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGH-rooftop-wiring-diagram")

    # LGX — Energence Ultra-High Efficiency Commercial Rooftop
    add("Lennox", "LGX", "Installation",
        "LGX Energence Ultra-High Efficiency Commercial Rooftop Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGX-rooftop-installation-guide")
    add("Lennox", "LGX", "Service",
        "LGX Energence Ultra-High Efficiency Commercial Rooftop Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGX-rooftop-service-manual")
    add("Lennox", "LGX", "Wiring",
        "LGX Energence Ultra-High Efficiency Commercial Rooftop Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGX-rooftop-wiring-diagram")

    # LGT — Gas/Electric Commercial Rooftop Unit
    add("Lennox", "LGT", "Installation",
        "LGT Gas/Electric Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGT-rooftop-installation-guide")
    add("Lennox", "LGT", "Service",
        "LGT Gas/Electric Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGT-rooftop-service-manual")
    add("Lennox", "LGT", "Wiring",
        "LGT Gas/Electric Commercial Rooftop Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGT-rooftop-wiring-diagram")

    # LGA — Commercial Gas/Electric Packaged Unit (3-12.5 ton)
    add("Lennox", "LGA", "Installation",
        "LGA Commercial Gas/Electric Packaged Unit (3-12.5 Ton) Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGA-rooftop-installation-guide")
    add("Lennox", "LGA", "Service",
        "LGA Commercial Gas/Electric Packaged Unit (3-12.5 Ton) Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGA-rooftop-service-manual")
    add("Lennox", "LGA", "Wiring",
        "LGA Commercial Gas/Electric Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGA-rooftop-wiring-diagram")

    # LGB — Commercial Gas/Electric Packaged Unit (15-25 ton)
    add("Lennox", "LGB", "Installation",
        "LGB Commercial Gas/Electric Packaged Unit (15-25 Ton) Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGB-rooftop-installation-guide")
    add("Lennox", "LGB", "Service",
        "LGB Commercial Gas/Electric Packaged Unit (15-25 Ton) Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGB-rooftop-service-manual")
    add("Lennox", "LGB", "Wiring",
        "LGB Commercial Gas/Electric Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGB-rooftop-wiring-diagram")

    # LGE — Commercial Electric/Electric Packaged Unit
    add("Lennox", "LGE", "Installation",
        "LGE Commercial Electric/Electric Packaged Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LGE-rooftop-installation-guide")
    add("Lennox", "LGE", "Service",
        "LGE Commercial Electric/Electric Packaged Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LGE-rooftop-service-manual")
    add("Lennox", "LGE", "Wiring",
        "LGE Commercial Electric/Electric Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LGE-rooftop-wiring-diagram")

    # KGA — mid-range commercial rooftop
    add("Lennox", "KGA", "Installation",
        "KGA Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/KGA-rooftop-installation-guide")
    add("Lennox", "KGA", "Service",
        "KGA Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/KGA-rooftop-service-manual")
    add("Lennox", "KGA", "Parts",
        "KGA Commercial Rooftop Unit Parts Catalog",
        "https://www.lennoxpros.com/documents/parts-lists/KGA-rooftop-parts-catalog")

    # KGB — mid-range commercial rooftop (gas/electric)
    add("Lennox", "KGB", "Installation",
        "KGB Commercial Rooftop Gas/Electric Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/KGB-rooftop-installation-guide")
    add("Lennox", "KGB", "Service",
        "KGB Commercial Rooftop Gas/Electric Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/KGB-rooftop-service-manual")

    # KCA — Economizer Packaged Unit
    add("Lennox", "KCA", "Installation",
        "KCA Economizer Packaged Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/KCA-rooftop-installation-guide")
    add("Lennox", "KCA", "Service",
        "KCA Economizer Packaged Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/KCA-rooftop-service-manual")
    add("Lennox", "KCA", "Wiring",
        "KCA Economizer Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/KCA-rooftop-wiring-diagram")

    # KCB — Commercial Economizer Unit
    add("Lennox", "KCB", "Installation",
        "KCB Commercial Economizer Packaged Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/KCB-rooftop-installation-guide")
    add("Lennox", "KCB", "Service",
        "KCB Commercial Economizer Packaged Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/KCB-rooftop-service-manual")
    add("Lennox", "KCB", "Wiring",
        "KCB Commercial Economizer Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/KCB-rooftop-wiring-diagram")

    # KHE — High Efficiency Commercial Package
    add("Lennox", "KHE", "Installation",
        "KHE High-Efficiency Commercial Packaged Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/KHE-rooftop-installation-guide")
    add("Lennox", "KHE", "Service",
        "KHE High-Efficiency Commercial Packaged Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/KHE-rooftop-service-manual")
    add("Lennox", "KHE", "Wiring",
        "KHE High-Efficiency Commercial Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/KHE-rooftop-wiring-diagram")

    # TSA — Strategos Commercial Rooftop
    add("Lennox", "TSA", "Installation",
        "TSA Strategos Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/TSA-strategos-installation-guide")
    add("Lennox", "TSA", "Service",
        "TSA Strategos Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/TSA-strategos-service-manual")
    add("Lennox", "TSA", "Wiring",
        "TSA Strategos Commercial Rooftop Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/TSA-strategos-wiring-diagram")

    # ZGA — small commercial rooftop
    add("Lennox", "ZGA", "Installation",
        "ZGA Light Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/ZGA-rooftop-installation-guide")
    add("Lennox", "ZGA", "Service",
        "ZGA Light Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/ZGA-rooftop-service-manual")

    # ZHA — small commercial rooftop heat pump
    add("Lennox", "ZHA", "Installation",
        "ZHA Light Commercial Rooftop Heat Pump Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/ZHA-rooftop-installation-guide")
    add("Lennox", "ZHA", "Service",
        "ZHA Light Commercial Rooftop Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/ZHA-rooftop-service-manual")
    add("Lennox", "ZHA", "Wiring",
        "ZHA Light Commercial Rooftop Heat Pump Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/ZHA-rooftop-wiring-diagram")

    # ==================================================================
    #  LENNOX  — Commercial Split Systems
    # ==================================================================

    # LCA — Commercial Split System AC
    add("Lennox", "LCA", "Installation",
        "LCA Commercial Split System Air Conditioner Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LCA-split-installation-guide")
    add("Lennox", "LCA", "Service",
        "LCA Commercial Split System Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LCA-split-service-manual")
    add("Lennox", "LCA", "Wiring",
        "LCA Commercial Split System Air Conditioner Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LCA-split-wiring-diagram")

    # LHA — Commercial Split System Heat Pump
    add("Lennox", "LHA", "Installation",
        "LHA Commercial Split System Heat Pump Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LHA-split-installation-guide")
    add("Lennox", "LHA", "Service",
        "LHA Commercial Split System Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LHA-split-service-manual")
    add("Lennox", "LHA", "Wiring",
        "LHA Commercial Split System Heat Pump Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LHA-split-wiring-diagram")

    # LS25 — Commercial Split System AC
    add("Lennox", "LS25", "Installation",
        "LS25 Commercial Split System Air Conditioner Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/LS25-split-installation-guide")
    add("Lennox", "LS25", "Service",
        "LS25 Commercial Split System Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/LS25-split-service-manual")
    add("Lennox", "LS25", "Wiring",
        "LS25 Commercial Split System Air Conditioner Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/LS25-split-wiring-diagram")

    # ==================================================================
    #  LENNOX  — VRF Systems
    # ==================================================================

    # VRC — VRF Condensing Unit
    add("Lennox", "VRC", "Installation",
        "VRC VRF Condensing Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/VRC-vrf-installation-guide")
    add("Lennox", "VRC", "Service",
        "VRC VRF Condensing Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/VRC-vrf-service-manual")
    add("Lennox", "VRC", "Wiring",
        "VRC VRF Condensing Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/VRC-vrf-wiring-diagram")

    # VRF — Mini-VRF Multi-Zone Outdoor
    add("Lennox", "VRF", "Installation",
        "VRF Mini-VRF Multi-Zone Outdoor Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/VRF-mini-vrf-installation-guide")
    add("Lennox", "VRF", "Service",
        "VRF Mini-VRF Multi-Zone Outdoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/VRF-mini-vrf-service-manual")
    add("Lennox", "VRF", "Wiring",
        "VRF Mini-VRF Multi-Zone Outdoor Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/VRF-mini-vrf-wiring-diagram")

    # CBA — Ceiling Cassette VRF Indoor
    add("Lennox", "CBA", "Installation",
        "CBA Ceiling Cassette VRF Indoor Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/CBA-vrf-ceiling-cassette-installation-guide")
    add("Lennox", "CBA", "Service",
        "CBA Ceiling Cassette VRF Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/CBA-vrf-ceiling-cassette-service-manual")

    # FBA — Floor/Ceiling VRF Indoor
    add("Lennox", "FBA", "Installation",
        "FBA Floor/Ceiling VRF Indoor Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/FBA-vrf-floor-ceiling-installation-guide")
    add("Lennox", "FBA", "Service",
        "FBA Floor/Ceiling VRF Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/FBA-vrf-floor-ceiling-service-manual")

    # DBA — Ducted VRF Indoor
    add("Lennox", "DBA", "Installation",
        "DBA Ducted VRF Indoor Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/DBA-vrf-ducted-installation-guide")
    add("Lennox", "DBA", "Service",
        "DBA Ducted VRF Indoor Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/DBA-vrf-ducted-service-manual")
    add("Lennox", "DBA", "Wiring",
        "DBA Ducted VRF Indoor Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/DBA-vrf-ducted-wiring-diagram")

    # ==================================================================
    #  LENNOX  — Controls / Thermostats
    # ==================================================================

    # iComfort S30
    add("Lennox", "iComfort S30", "Installation",
        "iComfort S30 Smart Thermostat Installation Guide",
        "https://www.lennox.com/resources/icomfort-s30-installation-guide")
    add("Lennox", "iComfort S30", "Service",
        "iComfort S30 Smart Thermostat Configuration & Service Guide",
        "https://www.lennoxpros.com/documents/service-manuals/iComfort-S30-service-guide")

    # iComfort E30
    add("Lennox", "iComfort E30", "Installation",
        "iComfort E30 Smart Thermostat Installation Guide",
        "https://www.lennox.com/resources/icomfort-e30-installation-guide")
    add("Lennox", "iComfort E30", "Service",
        "iComfort E30 Smart Thermostat Configuration & Service Guide",
        "https://www.lennoxpros.com/documents/service-manuals/iComfort-E30-service-guide")

    # iComfort M30
    add("Lennox", "iComfort M30", "Installation",
        "iComfort M30 Smart Thermostat Installation Guide",
        "https://www.lennox.com/resources/icomfort-m30-installation-guide")

    # Prodigy M3 — commercial controller
    add("Lennox", "Prodigy M3", "Installation",
        "Prodigy M3 Unit Controller Installation & Setup Guide",
        "https://www.lennoxpros.com/documents/installation-instructions/Prodigy-M3-installation-guide")
    add("Lennox", "Prodigy M3", "Service",
        "Prodigy M3 Unit Controller Programming & Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/Prodigy-M3-service-manual")

    # ==================================================================
    #  ALLIED  — Air Conditioners (A-Series / Numeric AC)
    # ==================================================================

    # 1AC18
    add("Allied", "1AC18", "Installation",
        "1AC18 18-SEER Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1AC18-installation-guide")
    add("Allied", "1AC18", "Service",
        "1AC18 18-SEER Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-1AC18-service-manual")

    # 1AC16
    add("Allied", "1AC16", "Installation",
        "1AC16 16-SEER Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1AC16-installation-guide")
    add("Allied", "1AC16", "Service",
        "1AC16 16-SEER Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-1AC16-service-manual")

    # 1AC14
    add("Allied", "1AC14", "Installation",
        "1AC14 14-SEER Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1AC14-installation-guide")
    add("Allied", "1AC14", "Service",
        "1AC14 14-SEER Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-1AC14-service-manual")

    # 1AC13
    add("Allied", "1AC13", "Installation",
        "1AC13 13-SEER Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1AC13-installation-guide")

    # A Series — Complete Allied AC line
    add("Allied", "A Series", "Installation",
        "A Series Air Conditioner Complete Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-A-series-ac-installation-guide")
    add("Allied", "A Series", "Service",
        "A Series Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-A-series-ac-service-manual")
    add("Allied", "A Series", "Wiring",
        "A Series Air Conditioner Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-A-series-ac-wiring-diagram")
    add("Allied", "A Series", "Parts",
        "A Series Air Conditioner Parts Catalog",
        "https://www.lennoxpros.com/documents/parts-lists/allied-A-series-ac-parts-catalog")

    # ==================================================================
    #  ALLIED  — Heat Pumps (HP Series)
    # ==================================================================

    # 1HP16
    add("Allied", "1HP16", "Installation",
        "1HP16 16-SEER Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1HP16-installation-guide")
    add("Allied", "1HP16", "Service",
        "1HP16 16-SEER Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-1HP16-service-manual")
    add("Allied", "1HP16", "Wiring",
        "1HP16 16-SEER Heat Pump Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-1HP16-wiring-diagram")

    # 1HP14
    add("Allied", "1HP14", "Installation",
        "1HP14 14-SEER Heat Pump Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-1HP14-installation-guide")
    add("Allied", "1HP14", "Service",
        "1HP14 14-SEER Heat Pump Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-1HP14-service-manual")

    # ==================================================================
    #  ALLIED  — Gas Furnaces
    # ==================================================================

    # 96G2V — 96% AFUE two-stage variable-speed
    add("Allied", "96G2V", "Installation",
        "96G2V 96% AFUE Two-Stage Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-96G2V-installation-guide")
    add("Allied", "96G2V", "Service",
        "96G2V 96% AFUE Two-Stage Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-96G2V-service-manual")
    add("Allied", "96G2V", "Wiring",
        "96G2V 96% AFUE Two-Stage Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-96G2V-wiring-diagram")

    # 80G2 — 80% AFUE single-stage
    add("Allied", "80G2", "Installation",
        "80G2 80% AFUE Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-80G2-installation-guide")
    add("Allied", "80G2", "Service",
        "80G2 80% AFUE Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-80G2-service-manual")

    # 95G2DF — 95% AFUE downflow
    add("Allied", "95G2DF", "Installation",
        "95G2DF 95% AFUE Downflow Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-95G2DF-installation-guide")
    add("Allied", "95G2DF", "Service",
        "95G2DF 95% AFUE Downflow Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-95G2DF-service-manual")

    # 80G1E — Economy Gas Furnace
    add("Allied", "80G1E", "Installation",
        "80G1E Economy 80% AFUE Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-80G1E-installation-guide")
    add("Allied", "80G1E", "Service",
        "80G1E Economy 80% AFUE Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-80G1E-service-manual")

    # 92G1 — 92% Gas Furnace
    add("Allied", "92G1", "Installation",
        "92G1 92% AFUE Gas Furnace Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-92G1-installation-guide")
    add("Allied", "92G1", "Service",
        "92G1 92% AFUE Gas Furnace Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-92G1-service-manual")
    add("Allied", "92G1", "Wiring",
        "92G1 92% AFUE Gas Furnace Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-92G1-wiring-diagram")

    # ==================================================================
    #  ALLIED  — Air Handlers & Accessories
    # ==================================================================

    # AH1 — single-speed air handler
    add("Allied", "AH1", "Installation",
        "AH1 Single-Speed Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-AH1-installation-guide")
    add("Allied", "AH1", "Parts",
        "AH1 Single-Speed Air Handler Parts List",
        "https://www.lennoxpros.com/documents/parts-lists/allied-AH1-parts-list")

    # AH2 — multi-speed air handler
    add("Allied", "AH2", "Installation",
        "AH2 Multi-Speed Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-AH2-installation-guide")
    add("Allied", "AH2", "Service",
        "AH2 Multi-Speed Air Handler Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-AH2-service-manual")
    add("Allied", "AH2", "Wiring",
        "AH2 Multi-Speed Air Handler Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-AH2-wiring-diagram")

    # AH3 — Variable Speed Air Handler
    add("Allied", "AH3", "Installation",
        "AH3 Variable-Speed Air Handler Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-AH3-installation-guide")
    add("Allied", "AH3", "Service",
        "AH3 Variable-Speed Air Handler Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-AH3-service-manual")
    add("Allied", "AH3", "Wiring",
        "AH3 Variable-Speed Air Handler Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-AH3-wiring-diagram")

    # EAC — Electronic Air Cleaner
    add("Allied", "EAC", "Installation",
        "EAC Electronic Air Cleaner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-EAC-installation-guide")
    add("Allied", "EAC", "Service",
        "EAC Electronic Air Cleaner Service & Maintenance Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-EAC-service-manual")

    # ==================================================================
    #  ALLIED  — Commercial Rooftops
    # ==================================================================

    # L Series — Commercial Rooftop
    add("Allied", "L Series", "Installation",
        "L Series Commercial Rooftop Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-L-series-rooftop-installation-guide")
    add("Allied", "L Series", "Service",
        "L Series Commercial Rooftop Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-L-series-rooftop-service-manual")
    add("Allied", "L Series", "Wiring",
        "L Series Commercial Rooftop Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-L-series-rooftop-wiring-diagram")
    add("Allied", "L Series", "Parts",
        "L Series Commercial Rooftop Unit Parts Catalog",
        "https://www.lennoxpros.com/documents/parts-lists/allied-L-series-rooftop-parts-catalog")

    # K Series — Commercial Packaged
    add("Allied", "K Series", "Installation",
        "K Series Commercial Packaged Unit Installation Manual",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-K-series-packaged-installation-guide")
    add("Allied", "K Series", "Service",
        "K Series Commercial Packaged Unit Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-K-series-packaged-service-manual")
    add("Allied", "K Series", "Wiring",
        "K Series Commercial Packaged Unit Wiring Diagrams",
        "https://www.lennoxpros.com/documents/wiring-diagrams/allied-K-series-packaged-wiring-diagram")
    add("Allied", "K Series", "Parts",
        "K Series Commercial Packaged Unit Parts Catalog",
        "https://www.lennoxpros.com/documents/parts-lists/allied-K-series-packaged-parts-catalog")

    # BCS — Packaged Terminal AC
    add("Allied", "BCS", "Installation",
        "BCS Packaged Terminal Air Conditioner Installation Instructions",
        "https://www.lennoxpros.com/documents/installation-instructions/allied-BCS-ptac-installation-guide")
    add("Allied", "BCS", "Service",
        "BCS Packaged Terminal Air Conditioner Service Manual",
        "https://www.lennoxpros.com/documents/service-manuals/allied-BCS-ptac-service-manual")

    # ==================================================================
    #  ADP  — HE Series Evaporator Coils
    # ==================================================================

    # HE32
    add("ADP", "HE32", "Installation",
        "HE32 Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HE32-installation-guide")
    add("ADP", "HE32", "Parts",
        "HE32 Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HE32-parts-specifications")

    # HE36
    add("ADP", "HE36", "Installation",
        "HE36 Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HE36-installation-guide")
    add("ADP", "HE36", "Parts",
        "HE36 Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HE36-parts-specifications")

    # HE42
    add("ADP", "HE42", "Installation",
        "HE42 Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HE42-installation-guide")
    add("ADP", "HE42", "Parts",
        "HE42 Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HE42-parts-specifications")

    # HE48
    add("ADP", "HE48", "Installation",
        "HE48 Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HE48-installation-guide")
    add("ADP", "HE48", "Parts",
        "HE48 Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HE48-parts-specifications")

    # HE60
    add("ADP", "HE60", "Installation",
        "HE60 Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HE60-installation-guide")
    add("ADP", "HE60", "Parts",
        "HE60 Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HE60-parts-specifications")

    # ==================================================================
    #  ADP  — LE Series Low-Profile Evaporator Coils
    # ==================================================================

    add("ADP", "LE Series", "Installation",
        "LE Series Low-Profile Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/LE-series-low-profile-installation-guide")
    add("ADP", "LE Series", "Parts",
        "LE Series Low-Profile Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/LE-series-low-profile-parts-specifications")
    add("ADP", "LE Series", "Service",
        "LE Series Low-Profile Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/LE-series-low-profile-service-guide")

    # ==================================================================
    #  ADP  — SE Series Slant Evaporator Coils
    # ==================================================================

    add("ADP", "SE Series", "Installation",
        "SE Series Slant Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/SE-series-slant-coil-installation-guide")
    add("ADP", "SE Series", "Parts",
        "SE Series Slant Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/SE-series-slant-coil-parts-specifications")
    add("ADP", "SE Series", "Service",
        "SE Series Slant Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/SE-series-slant-coil-service-guide")

    # ==================================================================
    #  ADP  — N Series New Construction Coils
    # ==================================================================

    add("ADP", "N Series", "Installation",
        "N Series New Construction Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/N-series-new-construction-installation-guide")
    add("ADP", "N Series", "Parts",
        "N Series New Construction Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/N-series-new-construction-parts-specifications")
    add("ADP", "N Series", "Service",
        "N Series New Construction Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/N-series-new-construction-service-guide")

    # ==================================================================
    #  ADP  — VS Series Vertical Slab Coils
    # ==================================================================

    add("ADP", "VS Series", "Installation",
        "VS Series Vertical Slab Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/VS-series-vertical-slab-installation-guide")
    add("ADP", "VS Series", "Parts",
        "VS Series Vertical Slab Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/VS-series-vertical-slab-parts-specifications")
    add("ADP", "VS Series", "Service",
        "VS Series Vertical Slab Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/VS-series-vertical-slab-service-guide")

    # ==================================================================
    #  ADP  — HD Series Heavy-Duty Coils
    # ==================================================================

    add("ADP", "HD Series", "Installation",
        "HD Series Heavy-Duty Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/HD-series-heavy-duty-installation-guide")
    add("ADP", "HD Series", "Parts",
        "HD Series Heavy-Duty Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/HD-series-heavy-duty-parts-specifications")
    add("ADP", "HD Series", "Service",
        "HD Series Heavy-Duty Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/HD-series-heavy-duty-service-guide")

    # ==================================================================
    #  ADP  — AF Series Air Handlers
    # ==================================================================

    add("ADP", "AF Series", "Installation",
        "AF Series Air Handler Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/AF-series-air-handler-installation-guide")
    add("ADP", "AF Series", "Service",
        "AF Series Air Handler Service Manual",
        "https://www.adpnow.com/documents/service-manuals/AF-series-air-handler-service-manual")
    add("ADP", "AF Series", "Wiring",
        "AF Series Air Handler Wiring Diagrams",
        "https://www.adpnow.com/documents/wiring-diagrams/AF-series-air-handler-wiring-diagram")
    add("ADP", "AF Series", "Parts",
        "AF Series Air Handler Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/AF-series-air-handler-parts-specifications")

    # ==================================================================
    #  ADP  — MP Series Multi-Position Coils
    # ==================================================================

    add("ADP", "MP Series", "Installation",
        "MP Series Multi-Position Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/MP-series-installation-guide")
    add("ADP", "MP Series", "Parts",
        "MP Series Multi-Position Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/MP-series-parts-specifications")
    add("ADP", "MP Series", "Service",
        "MP Series Multi-Position Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/MP-series-service-guide")

    # ==================================================================
    #  ADP  — C Series Cased Coils
    # ==================================================================

    add("ADP", "C Series", "Installation",
        "C Series Cased Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/C-series-cased-coil-installation-guide")
    add("ADP", "C Series", "Parts",
        "C Series Cased Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/C-series-cased-coil-parts-specifications")

    # ==================================================================
    #  ADP  — B Series Coils
    # ==================================================================

    add("ADP", "B Series", "Installation",
        "B Series Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/B-series-coil-installation-guide")
    add("ADP", "B Series", "Parts",
        "B Series Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/B-series-coil-parts-specifications")

    # ==================================================================
    #  ADP  — S Series Uncased Coils
    # ==================================================================

    add("ADP", "S Series", "Installation",
        "S Series Uncased Evaporator Coil Installation Instructions",
        "https://www.adpnow.com/documents/installation-instructions/S-series-uncased-coil-installation-guide")
    add("ADP", "S Series", "Parts",
        "S Series Uncased Evaporator Coil Parts & Specifications",
        "https://www.adpnow.com/documents/parts-specs/S-series-uncased-coil-parts-specifications")
    add("ADP", "S Series", "Service",
        "S Series Uncased Evaporator Coil Service & Maintenance Guide",
        "https://www.adpnow.com/documents/service-manuals/S-series-uncased-coil-service-guide")

    # ==================================================================
    #  TRANE
    # ==================================================================

    add("Trane", "XR15", "Installation",
        "XR15 Heat Pump Installation Manual",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,heat pump,single-stage")
    add("Trane", "XR15", "Service",
        "XR15 Heat Pump Service Manual",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,heat pump")
    add("Trane", "XV20i", "Installation",
        "XV20i Variable-Speed Heat Pump Installation Manual",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed,communicating")
    add("Trane", "XV20i", "Service",
        "XV20i Variable-Speed Heat Pump Service Manual",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed")
    add("Trane", "S9X2", "Installation",
        "S9X2 96% AFUE Two-Stage Gas Furnace Installation Manual",
        equipment_type="Furnace", tonnage="", fuel_type="Natural Gas",
        tags="residential,two-stage,96-afue")
    add("Trane", "S9X2", "Service",
        "S9X2 96% AFUE Two-Stage Gas Furnace Service Manual",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,two-stage")
    add("Trane", "4TWR7", "Installation",
        "4TWR7 XR17 Air Conditioner Installation Manual",
        equipment_type="Condenser", tonnage="5 Ton", fuel_type="Electric",
        tags="residential,two-stage,high-efficiency")
    add("Trane", "GAM5", "Installation",
        "GAM5 Air Handler Installation Manual",
        equipment_type="Air Handler", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,variable-speed")

    # ==================================================================
    #  CARRIER
    # ==================================================================

    add("Carrier", "24ACC636", "Installation",
        "24ACC6 Comfort Series Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,14-seer")
    add("Carrier", "24ACC636", "Service",
        "24ACC6 Comfort Series Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Carrier", "25VNA048", "Installation",
        "Infinity 24VNA Variable-Speed Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed,infinity,communicating")
    add("Carrier", "25VNA048", "Service",
        "Infinity 24VNA Variable-Speed Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed")
    add("Carrier", "59MN7", "Installation",
        "59MN7 Performance 96 Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,two-stage,96-afue")
    add("Carrier", "FE4ANF005", "Installation",
        "FE4A Fan Coil / Air Handler Installation Instructions",
        equipment_type="Air Handler", tonnage="5 Ton", fuel_type="Electric",
        tags="residential,variable-speed")

    # ==================================================================
    #  GOODMAN / DAIKIN
    # ==================================================================

    add("Goodman", "GSX160361", "Installation",
        "GSX16 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Goodman", "GSX160361", "Service",
        "GSX16 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Goodman", "GSZC180481", "Installation",
        "GSZC18 18-SEER Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage,high-efficiency")
    add("Goodman", "GMVM970804CNA", "Installation",
        "GMVM97 96% AFUE Variable-Speed Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,variable-speed,96-afue")
    add("Goodman", "GMVM970804CNA", "Service",
        "GMVM97 96% AFUE Variable-Speed Gas Furnace Service Manual",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,variable-speed")
    add("Daikin", "DX16SA0361", "Installation",
        "DX16SA 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage")
    add("Daikin", "DX16SA0361", "Service",
        "DX16SA 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Daikin", "DZ18TC0481", "Installation",
        "DZ18TC Two-Stage Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage,high-efficiency")

    # ==================================================================
    #  RHEEM / RUUD
    # ==================================================================

    add("Rheem", "RA1636AJ1NA", "Installation",
        "Classic Series RA16 Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Rheem", "RA1636AJ1NA", "Service",
        "Classic Series RA16 Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Rheem", "RP2036FJTNJA", "Installation",
        "Endeavor Line RP20 Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,variable-speed,communicating")
    add("Rheem", "R96VA0702317MSA", "Installation",
        "Classic Plus R96V Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,variable-speed,96-afue")
    add("Ruud", "RA1636AJ1NA", "Installation",
        "Achiever Series RA16 Air Conditioner Installation Instructions",
        brand="Ruud", equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Ruud", "UP2036FJTNJA", "Installation",
        "Endeavor Line UP20 Heat Pump Installation Instructions",
        brand="Ruud", equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,variable-speed,communicating")

    # ==================================================================
    #  YORK
    # ==================================================================

    add("York", "DERA-F036N", "Installation",
        "LX Series 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("York", "DERA-F036N", "Service",
        "LX Series 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("York", "YZH048", "Installation",
        "YZH Horizontal Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage")
    add("York", "TG9S080B12MP11", "Installation",
        "TG9S 92% Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,single-stage,92-afue")

    # ==================================================================
    #  MITSUBISHI  — Ductless / Mini Splits
    # ==================================================================

    add("Mitsubishi", "MSZ-FH12NA", "Installation",
        "MSZ-FH Hyper-Heating Wall-Mount Indoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,hyper-heat,wall-mount,inverter")
    add("Mitsubishi", "MSZ-FH12NA", "Service",
        "MSZ-FH Hyper-Heating Wall-Mount Indoor Unit Service Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,hyper-heat")
    add("Mitsubishi", "MUZ-FH18NAH", "Installation",
        "MUZ-FH Hyper-Heating Outdoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="1.5 Ton", fuel_type="Electric",
        tags="ductless,hyper-heat,outdoor-unit,inverter")
    add("Mitsubishi", "MXZ-4C36NAHZ", "Installation",
        "MXZ Multi-Zone Hyper-Heating Outdoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="3 Ton", fuel_type="Electric",
        tags="ductless,multi-zone,hyper-heat,inverter")
    add("Mitsubishi", "PUZ-HA36NHA5", "Installation",
        "PUZ-HA H2i PLUS Outdoor Unit Installation Manual",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="ducted,h2i-plus,inverter,cold-climate")
    add("Mitsubishi", "SVZ-KP18NA", "Installation",
        "SVZ-KP Ducted Air Handler Installation Manual",
        equipment_type="Air Handler", tonnage="1.5 Ton", fuel_type="Electric",
        tags="ducted,multi-position,inverter")

    # ==================================================================
    #  FUJITSU  — Ductless / Mini Splits
    # ==================================================================

    add("Fujitsu", "ASU12RLF1", "Installation",
        "Halcyon 12RLF1 Wall-Mount Indoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,wall-mount,halcyon,inverter")
    add("Fujitsu", "ASU12RLF1", "Service",
        "Halcyon 12RLF1 Wall-Mount Indoor Unit Service Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,halcyon")
    add("Fujitsu", "AOU36RLXFZH", "Installation",
        "36RLXFZH Multi-Zone Outdoor Heat Pump Installation Manual",
        equipment_type="Mini Split", tonnage="3 Ton", fuel_type="Electric",
        tags="ductless,multi-zone,extra-low-temp,inverter")
    add("Fujitsu", "ARU18RLF", "Installation",
        "Slim Duct Indoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="1.5 Ton", fuel_type="Electric",
        tags="ducted,slim-duct,concealed")

    # ==================================================================
    #  LG  — Ductless / VRF
    # ==================================================================

    add("LG", "LSN120HSV5", "Installation",
        "Art Cool Wall-Mount Mini Split Indoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,wall-mount,art-cool,inverter")
    add("LG", "LSN120HSV5", "Service",
        "Art Cool Wall-Mount Mini Split Indoor Unit Service Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,art-cool")
    add("LG", "LMU360HHV", "Installation",
        "Multi F MAX Multi-Zone Outdoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="3 Ton", fuel_type="Electric",
        tags="multi-zone,inverter,heat-pump")
    add("LG", "ARUV096DTS4", "Installation",
        "Multi V 5 VRF Outdoor Unit Installation Manual",
        equipment_type="VRF System", tonnage="8 Ton", fuel_type="Electric",
        tags="commercial,vrf,heat-recovery,inverter")

    # ==================================================================
    #  SAMSUNG  — Ductless / VRF
    # ==================================================================

    add("Samsung", "AR12TXCAAWKNEU", "Installation",
        "Wind-Free Wall-Mount Mini Split Installation Manual",
        equipment_type="Mini Split", tonnage="1 Ton", fuel_type="Electric",
        tags="ductless,wind-free,wall-mount,inverter")
    add("Samsung", "AJ128TXJ5CH", "Installation",
        "FJM Multi-Zone Outdoor Unit Installation Manual",
        equipment_type="Mini Split", tonnage="4 Ton", fuel_type="Electric",
        tags="multi-zone,inverter")
    add("Samsung", "AM096FXVAFH", "Installation",
        "DVM S VRF Outdoor Unit Installation Manual",
        equipment_type="VRF System", tonnage="8 Ton", fuel_type="Electric",
        tags="commercial,vrf,heat-recovery,inverter")

    # ==================================================================
    #  BOSCH
    # ==================================================================

    add("Bosch", "BOVA-36HDN1-M20G", "Installation",
        "IDS 2.0 20-SEER Inverter Ducted Heat Pump Installation Manual",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,inverter,ducted,high-efficiency")
    add("Bosch", "BOVA-36HDN1-M20G", "Service",
        "IDS 2.0 20-SEER Inverter Ducted Heat Pump Service Manual",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,inverter")
    add("Bosch", "BMS-24FNAI", "Installation",
        "Climate 5000 Wall-Mount Ductless System Installation Manual",
        equipment_type="Mini Split", tonnage="2 Ton", fuel_type="Electric",
        tags="ductless,wall-mount,inverter")
    add("Bosch", "BGH96M080B3A", "Installation",
        "BGH96 96% AFUE Modulating Gas Furnace Installation Manual",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,modulating,96-afue")

    # ==================================================================
    #  AMANA
    # ==================================================================

    add("Amana", "ASX160361", "Installation",
        "ASX16 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Amana", "ASX160361", "Service",
        "ASX16 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Amana", "AVXC200491", "Installation",
        "AVXC20 Variable-Speed Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed,high-efficiency")
    add("Amana", "AMVM970804CNA", "Installation",
        "AMVM97 Variable-Speed Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,variable-speed,96-afue")

    # ==================================================================
    #  BRYANT
    # ==================================================================

    add("Bryant", "127ANA036", "Installation",
        "Legacy Line 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Bryant", "127ANA036", "Service",
        "Legacy Line 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Bryant", "280ANV048", "Installation",
        "Evolution Variable-Speed Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,variable-speed,evolution,communicating")
    add("Bryant", "987MA60080C21", "Installation",
        "Evolution 98 Modulating Gas Furnace Installation Instructions",
        equipment_type="Furnace", fuel_type="Natural Gas",
        tags="residential,modulating,98-afue")

    # ==================================================================
    #  PAYNE
    # ==================================================================

    add("Payne", "PA4SNA036", "Installation",
        "PA4S 14-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,14-seer")
    add("Payne", "PA4SNA036", "Service",
        "PA4S 14-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Payne", "PH5SAN036", "Installation",
        "PH5S 15-SEER Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage")

    # ==================================================================
    #  HEIL
    # ==================================================================

    add("Heil", "HCA636GKA", "Installation",
        "QuietComfort Deluxe 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Heil", "HCA636GKA", "Service",
        "QuietComfort Deluxe 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Heil", "HHP048GKA", "Installation",
        "QuietComfort Deluxe Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage")

    # ==================================================================
    #  TEMPSTAR
    # ==================================================================

    add("Tempstar", "TCA636GKA", "Installation",
        "Performance 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Tempstar", "TCA636GKA", "Service",
        "Performance 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Tempstar", "THP048GKA", "Installation",
        "Performance Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage")

    # ==================================================================
    #  COMFORTMAKER
    # ==================================================================

    add("Comfortmaker", "CCA636GKA", "Installation",
        "SoftSound Deluxe 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Comfortmaker", "CCA636GKA", "Service",
        "SoftSound Deluxe 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Comfortmaker", "CHP048GKA", "Installation",
        "SoftSound Deluxe Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage")

    # ==================================================================
    #  DAY & NIGHT
    # ==================================================================

    add("Day & Night", "DCA636GKA", "Installation",
        "Performance 16-SEER Air Conditioner Installation Instructions",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential,single-stage,16-seer")
    add("Day & Night", "DCA636GKA", "Service",
        "Performance 16-SEER Air Conditioner Service Manual",
        equipment_type="Condenser", tonnage="3 Ton", fuel_type="Electric",
        tags="residential")
    add("Day & Night", "DHP048GKA", "Installation",
        "Performance Heat Pump Installation Instructions",
        equipment_type="Heat Pump", tonnage="4 Ton", fuel_type="Electric",
        tags="residential,two-stage")

    # ------------------------------------------------------------------
    # Insert new records — skip any that already exist by
    # (manufacturer, model_number, manual_type) to allow safe re-runs.
    # ------------------------------------------------------------------
    cursor = conn.cursor()

    # Build a set of already-existing keys for O(1) lookup
    cursor.execute(
        "SELECT manufacturer, model_number, manual_type FROM equipment_manuals"
    )
    existing_keys = {
        (row[0], row[1], row[2]) for row in cursor.fetchall()
    }

    to_insert = [
        entry for entry in manuals
        if (entry[0], entry[1], entry[2]) not in existing_keys
    ]

    if not to_insert:
        print(
            f"equipment_manuals already up-to-date "
            f"({len(existing_keys)} records present, nothing new to add)."
        )
        return

    cursor.executemany(
        """
        INSERT INTO equipment_manuals
            (manufacturer, model_number, manual_type, title, file_path, external_url,
             brand, equipment_type, tonnage, fuel_type, tags, uploaded_by)
        VALUES
            (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, NULL)
        """,
        to_insert,
    )
    conn.commit()
    print(
        f"Seeded {len(to_insert)} new equipment manual records "
        f"({len(existing_keys)} already existed, skipped)."
    )


# ------------------------------------------------------------------
# Allow running directly: python seed_manuals.py
# ------------------------------------------------------------------
if __name__ == "__main__":
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "jobs.db")
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        raise SystemExit(1)

    conn = sqlite3.connect(db_path)
    try:
        seed_equipment_manuals(conn)
    finally:
        conn.close()
