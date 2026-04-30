from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    active: bool = True


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class UserPayload(BaseModel):
    name: str
    email: str
    role: str = Field(pattern="^(operator|adm|superadm)$")
    password: str | None = None
    active: bool = True


class VendorPayload(BaseModel):
    kind: str = Field(pattern="^(service|product)$")
    name: str
    document: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str = "active"
    notes: str | None = None


class UnitPayload(BaseModel):
    name: str
    code: str
    tax_id: str | None = None
    state_registration: str | None = None
    city: str | None = None
    state: str | None = None
    address: str | None = None
    manager_name: str | None = None
    manager_email: str | None = None
    manager_phone: str | None = None
    active: bool = True
    notes: str | None = None


class ContractPayload(BaseModel):
    vendor_id: int
    unit_id: int
    title: str
    contract_number: str | None = None
    category: str | None = None
    compliance_type: str | None = None
    certificate_number: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    value: float = 0
    status: str = "active"
    renewal_alert_days: int = 30
    notes: str | None = None


class InvoicePayload(BaseModel):
    vendor_id: int
    unit_id: int
    contract_id: int | None = None
    invoice_number: str
    series: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    total_amount: float = 0
    tax_amount: float = 0
    status: str = "pending"
    access_key: str | None = None
    notes: str | None = None


class ProfessionalPayload(BaseModel):
    vendor_id: int
    name: str
    role: str | None = None
    document: str | None = None
    license_number: str | None = None
    email: str | None = None
    phone: str | None = None
    active: bool = True
    notes: str | None = None


class RegulatoryDocumentPayload(BaseModel):
    document_type: str = Field(pattern="^(AVCB|CLCB)$")
    unit_id: int
    vendor_id: int | None = None
    professional_id: int | None = None
    contract_id: int | None = None
    request_number: str | None = None
    document_number: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    status: str = "in_progress"
    last_inspection_date: str | None = None
    notes: str | None = None


class FileRecordPayload(BaseModel):
    category: str | None = None
    notes: str | None = None
    vendor_id: int | None = None
    unit_id: int | None = None
    contract_id: int | None = None
    invoice_id: int | None = None
    regulatory_document_id: int | None = None


class DeleteElevationPayload(BaseModel):
    email: str | None = None
    password: str | None = None
