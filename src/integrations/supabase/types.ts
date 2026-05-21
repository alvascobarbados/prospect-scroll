export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          display_label: string | null
          display_order: number
          id: string
          key: string
          section: string
          updated_at: string
          value: string | null
          value_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_label?: string | null
          display_order?: number
          id?: string
          key: string
          section: string
          updated_at?: string
          value?: string | null
          value_type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_label?: string | null
          display_order?: number
          id?: string
          key?: string
          section?: string
          updated_at?: string
          value?: string | null
          value_type?: string
        }
        Relationships: []
      }
      buyers: {
        Row: {
          contact: string | null
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          contact_name: string | null
          country: string
          created_at: string
          default_shipping_mode: string | null
          destination_id: string | null
          email: string | null
          id: string
          incoterms: string | null
          name: string
          notes: string | null
          payment_terms: string
          payment_terms_custom_days: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          destination_id?: string | null
          email?: string | null
          id?: string
          incoterms?: string | null
          name: string
          notes?: string | null
          payment_terms?: string
          payment_terms_custom_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          destination_id?: string | null
          email?: string | null
          id?: string
          incoterms?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string
          payment_terms_custom_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      decoration_methods: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          notes: string | null
          sub_rule_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          sub_rule_type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          sub_rule_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      detail_labels: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          position: number
          product_id: string | null
          project_id: string
          qty: number
          total: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          position: number
          product_id?: string | null
          project_id: string
          qty: number
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          position?: number
          product_id?: string | null
          project_id?: string
          qty?: number
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      method_details: {
        Row: {
          code: string
          created_at: string
          decoration_method_id: string
          detail: string
          id: string
          n_run: number
          n_setup: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          decoration_method_id: string
          detail: string
          id?: string
          n_run?: number
          n_setup?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          decoration_method_id?: string
          detail?: string
          id?: string
          n_run?: number
          n_setup?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "method_details_decoration_method_id_fkey"
            columns: ["decoration_method_id"]
            isOneToOne: false
            referencedRelation: "decoration_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      origins: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          base_margin_pct: number
          code: string | null
          created_at: string
          duty_rate_pct: number | null
          id: string
          name: string
          notes: string | null
          parent_id: string | null
          step_size_pct: number
          updated_at: string
        }
        Insert: {
          base_margin_pct: number
          code?: string | null
          created_at?: string
          duty_rate_pct?: number | null
          id?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          step_size_pct: number
          updated_at?: string
        }
        Update: {
          base_margin_pct?: number
          code?: string | null
          created_at?: string
          duty_rate_pct?: number | null
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          step_size_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_decoration_bands: {
        Row: {
          created_at: string
          id: string
          product_decoration_id: string
          qty: number
          setup_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_decoration_id: string
          qty: number
          setup_cost?: number
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_decoration_id?: string
          qty?: number
          setup_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_decoration_bands_product_decoration_id_fkey"
            columns: ["product_decoration_id"]
            isOneToOne: false
            referencedRelation: "product_decorations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_decorations: {
        Row: {
          created_at: string
          id: string
          method_detail_id: string
          notes: string | null
          product_id: string
          ref_image_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          method_detail_id: string
          notes?: string | null
          product_id: string
          ref_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          method_detail_id?: string
          notes?: string | null
          product_id?: string
          ref_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_decorations_method_detail_id_fkey"
            columns: ["method_detail_id"]
            isOneToOne: false
            referencedRelation: "method_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_decorations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_details: {
        Row: {
          created_at: string
          detail_label_id: string
          id: string
          product_id: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          detail_label_id: string
          id?: string
          product_id: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          detail_label_id?: string
          id?: string
          product_id?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_details_detail_label_id_fkey"
            columns: ["detail_label_id"]
            isOneToOne: false
            referencedRelation: "detail_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          carton_height: number | null
          carton_length: number | null
          carton_pack: number | null
          carton_weight: number | null
          carton_width: number | null
          created_at: string
          display_order: number | null
          id: string
          image_url: string | null
          moq: number | null
          name: string
          notes: string | null
          origin_id: string
          parent_product_id: string | null
          primary_item_number: string
          production_days_max: number | null
          production_days_min: number
          subcategory_id: string
          supplier_description: string | null
          supplier_id: string
          supplier_item_name: string | null
          supplier_item_number: string | null
          updated_at: string
          variant_label: string | null
        }
        Insert: {
          carton_height?: number | null
          carton_length?: number | null
          carton_pack?: number | null
          carton_weight?: number | null
          carton_width?: number | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          moq?: number | null
          name: string
          notes?: string | null
          origin_id: string
          parent_product_id?: string | null
          primary_item_number: string
          production_days_max?: number | null
          production_days_min: number
          subcategory_id: string
          supplier_description?: string | null
          supplier_id: string
          supplier_item_name?: string | null
          supplier_item_number?: string | null
          updated_at?: string
          variant_label?: string | null
        }
        Update: {
          carton_height?: number | null
          carton_length?: number | null
          carton_pack?: number | null
          carton_weight?: number | null
          carton_width?: number | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          moq?: number | null
          name?: string
          notes?: string | null
          origin_id?: string
          parent_product_id?: string | null
          primary_item_number?: string
          production_days_max?: number | null
          production_days_min?: number
          subcategory_id?: string
          supplier_description?: string | null
          supplier_id?: string
          supplier_item_name?: string | null
          supplier_item_number?: string | null
          updated_at?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "origins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_log_entries: {
        Row: {
          action_type: string
          actor_display_name: string
          actor_user_id: string
          description: string
          id: string
          metadata: Json | null
          project_id: string
          ts: string
        }
        Insert: {
          action_type: string
          actor_display_name: string
          actor_user_id: string
          description: string
          id: string
          metadata?: Json | null
          project_id: string
          ts?: string
        }
        Update: {
          action_type?: string
          actor_display_name?: string
          actor_user_id?: string
          description?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_log_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          author: string
          author_user_id: string | null
          auto: boolean
          id: string
          project_id: string
          text: string
          ts: string
          updated_at: string
        }
        Insert: {
          author: string
          author_user_id?: string | null
          auto?: boolean
          id: string
          project_id: string
          text: string
          ts?: string
          updated_at?: string
        }
        Update: {
          author?: string
          author_user_id?: string | null
          auto?: boolean
          id?: string
          project_id?: string
          text?: string
          ts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          buyer_id: string | null
          cbm: number | null
          completion_date: string | null
          contact_person: string | null
          created_at: string
          customer: string
          deadline: string
          deadline_date: string | null
          deleted_at: string | null
          deleted_from_pipeline: string | null
          deleted_from_stage: string | null
          deposit_amount: number | null
          deposit_invoice_number: string | null
          deposit_paid_date: string | null
          deposit_paid_method: string | null
          deposit_payment_reference: string | null
          deposit_required: boolean
          design_brief: string | null
          detail_summary: string | null
          flagged: boolean
          id: string
          invoice_issued_date: string | null
          invoice_issued_date_assumed: boolean | null
          invoice_number: string | null
          invoice_required_entered_at: string | null
          num_packages: number | null
          order_type: string
          outstanding_balance: number | null
          paid_on_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_terms: string | null
          payment_terms_custom_days: number | null
          payment_terms_inherited: boolean | null
          pipeline_id: string
          po_amount: number | null
          po_amount_currency: string
          po_number: string | null
          point_person: string
          priority: string
          project_name: string
          proof_number: string | null
          quote_number: string | null
          sales_shipping_label: string | null
          shipment_id: string | null
          shipment_number: string | null
          shipping_mode: string | null
          stage_id: string
          supplier_id: string | null
          supplier_label: string | null
          tag: string | null
          tracking_ref: string | null
          updated_at: string
          value: number
          volume_unit: string
          volume_value: number | null
          weight_kg: number | null
          weight_unit: string
        }
        Insert: {
          buyer_id?: string | null
          cbm?: number | null
          completion_date?: string | null
          contact_person?: string | null
          created_at?: string
          customer: string
          deadline: string
          deadline_date?: string | null
          deleted_at?: string | null
          deleted_from_pipeline?: string | null
          deleted_from_stage?: string | null
          deposit_amount?: number | null
          deposit_invoice_number?: string | null
          deposit_paid_date?: string | null
          deposit_paid_method?: string | null
          deposit_payment_reference?: string | null
          deposit_required?: boolean
          design_brief?: string | null
          detail_summary?: string | null
          flagged?: boolean
          id: string
          invoice_issued_date?: string | null
          invoice_issued_date_assumed?: boolean | null
          invoice_number?: string | null
          invoice_required_entered_at?: string | null
          num_packages?: number | null
          order_type?: string
          outstanding_balance?: number | null
          paid_on_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          payment_terms_custom_days?: number | null
          payment_terms_inherited?: boolean | null
          pipeline_id: string
          po_amount?: number | null
          po_amount_currency?: string
          po_number?: string | null
          point_person: string
          priority?: string
          project_name: string
          proof_number?: string | null
          quote_number?: string | null
          sales_shipping_label?: string | null
          shipment_id?: string | null
          shipment_number?: string | null
          shipping_mode?: string | null
          stage_id: string
          supplier_id?: string | null
          supplier_label?: string | null
          tag?: string | null
          tracking_ref?: string | null
          updated_at?: string
          value?: number
          volume_unit?: string
          volume_value?: number | null
          weight_kg?: number | null
          weight_unit?: string
        }
        Update: {
          buyer_id?: string | null
          cbm?: number | null
          completion_date?: string | null
          contact_person?: string | null
          created_at?: string
          customer?: string
          deadline?: string
          deadline_date?: string | null
          deleted_at?: string | null
          deleted_from_pipeline?: string | null
          deleted_from_stage?: string | null
          deposit_amount?: number | null
          deposit_invoice_number?: string | null
          deposit_paid_date?: string | null
          deposit_paid_method?: string | null
          deposit_payment_reference?: string | null
          deposit_required?: boolean
          design_brief?: string | null
          detail_summary?: string | null
          flagged?: boolean
          id?: string
          invoice_issued_date?: string | null
          invoice_issued_date_assumed?: boolean | null
          invoice_number?: string | null
          invoice_required_entered_at?: string | null
          num_packages?: number | null
          order_type?: string
          outstanding_balance?: number | null
          paid_on_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          payment_terms_custom_days?: number | null
          payment_terms_inherited?: boolean | null
          pipeline_id?: string
          po_amount?: number | null
          po_amount_currency?: string
          po_number?: string | null
          point_person?: string
          priority?: string
          project_name?: string
          proof_number?: string | null
          quote_number?: string | null
          sales_shipping_label?: string | null
          shipment_id?: string | null
          shipment_number?: string | null
          shipping_mode?: string | null
          stage_id?: string
          supplier_id?: string | null
          supplier_label?: string | null
          tag?: string | null
          tracking_ref?: string | null
          updated_at?: string
          value?: number
          volume_unit?: string
          volume_value?: number | null
          weight_kg?: number | null
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_shipment_fk"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      rounding_rules: {
        Row: {
          band_max: number | null
          band_min: number
          created_at: string
          description: string | null
          display_order: number
          id: string
          round_up_to: number
          updated_at: string
        }
        Insert: {
          band_max?: number | null
          band_min: number
          created_at?: string
          description?: string | null
          display_order: number
          id?: string
          round_up_to: number
          updated_at?: string
        }
        Update: {
          band_max?: number | null
          band_min?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          round_up_to?: number
          updated_at?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier: string | null
          code: string
          created_at: string
          eta: string
          etd: string
          id: string
          mode: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          code: string
          created_at?: string
          eta: string
          etd: string
          id: string
          mode: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          code?: string
          created_at?: string
          eta?: string
          etd?: string
          id?: string
          mode?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_method_routes: {
        Row: {
          created_at: string
          destination_id: string
          fixed_cost: number
          id: string
          notes: string | null
          origin_id: string
          shipping_method_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_id: string
          fixed_cost?: number
          id?: string
          notes?: string | null
          origin_id: string
          shipping_method_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_id?: string
          fixed_cost?: number
          id?: string
          notes?: string | null
          origin_id?: string
          shipping_method_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_method_routes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_method_routes_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "origins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_method_routes_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_method_tiers: {
        Row: {
          band_from: number
          band_to: number | null
          created_at: string
          id: string
          notes: string | null
          rate: number
          route_id: string
          updated_at: string
        }
        Insert: {
          band_from?: number
          band_to?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number
          route_id: string
          updated_at?: string
        }
        Update: {
          band_from?: number
          band_to?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number
          route_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_method_tiers_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "shipping_method_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          buffer_pct: number
          code: string
          created_at: string
          fuel_surcharge_pct: number
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          buffer_pct?: number
          code: string
          created_at?: string
          fuel_surcharge_pct?: number
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          buffer_pct?: number
          code?: string
          created_at?: string
          fuel_surcharge_pct?: number
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          code: string | null
          country: string
          created_at: string
          default_shipping_mode: string | null
          id: string
          legacy_id: string | null
          name: string
          notes: string | null
          origin_id: string | null
          updated_at: string
          volume_unit: string
          weight_unit: string
        }
        Insert: {
          code?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          notes?: string | null
          origin_id?: string | null
          updated_at?: string
          volume_unit?: string
          weight_unit?: string
        }
        Update: {
          code?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          notes?: string | null
          origin_id?: string | null
          updated_at?: string
          volume_unit?: string
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "origins"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          initials: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          initials: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          initials?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      heal_data_relationships: {
        Args: { p_actor_id?: string; p_actor_name?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
