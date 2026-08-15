// src/types/index.ts

export interface Project {
  id: number;
  project_name: string;
  project_code: string;
  description: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  customer_name: string;
  customer_code: string;
  contact_email: string | null;
  contact_phone: string | null;
  project_id: number;
  project_name: string;
  project_code: string;
  created_at: string;
}

export interface CustomerProfile {
  id: number;
  customer_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  project: {
    id: number;
    code: string;
    name: string;
  };
}