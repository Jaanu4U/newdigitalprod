from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from fpdf import FPDF
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.mime.text import MIMEText
from email.utils import formatdate
import json as _json
import uuid

from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from ..core import settings
from ..tenancy import resolve_tenant
from pydantic import BaseModel

router = APIRouter()


def _role_can_invoice(role: str) -> bool:
    rl = (role or '').lower()
    return rl in {'admin','owner','superadmin','orders manager','billing staff'}


def _auto_create_delivery(db: Session, org_id: str, invoice_id: str, customer_id: str, invoice_data: dict) -> Optional[str]:
    """
    Auto-create a delivery record when an invoice draft is saved.
    Returns delivery_id if successful, None otherwise.
    """
    try:
        # Check if delivery already exists
        existing = db.query(models.Delivery).filter(
            models.Delivery.org_id == org_id,
            models.Delivery.order_id == invoice_id
        ).first()
        
        if existing:
            logging.info(f"Delivery already exists: {existing.delivery_id}")
            return existing.delivery_id
        
        # Get customer details
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == customer_id,
            models.Customer.org_id == org_id
        ).first()
        
        if not customer:
            logging.warning(f"Customer not found: {customer_id}")
            return None
        
        # Determine delivery address
        delivery_address = invoice_data.get('delivery_address')
        if not delivery_address and invoice_data.get('ship_to_same'):
            delivery_address = customer.address
        if not delivery_address:
            delivery_address = invoice_data.get('ship_to_address') or customer.address
        
        if not delivery_address:
            logging.warning(f"No delivery address found for customer: {customer_id}")
            delivery_address = "Address not provided"
        
        # Create delivery record
        delivery_id = str(uuid.uuid4())
        logging.info(f"Creating delivery: {delivery_id} for invoice: {invoice_id}")
        delivery = models.Delivery(
            delivery_id=delivery_id,
            org_id=org_id,
            order_id=invoice_id,
            customer=customer.name or "Unknown",
            address=delivery_address,
            latitude=str(invoice_data.get('delivery_latitude')) if invoice_data.get('delivery_latitude') else None,
            longitude=str(invoice_data.get('delivery_longitude')) if invoice_data.get('delivery_longitude') else None,
            status="pending",
            created_at=datetime.utcnow()
        )
        
        db.add(delivery)
        db.flush()  # Flush but don't commit yet (caller will commit)
        logging.info(f"Delivery created successfully: {delivery_id}")
        
        return delivery_id
        
    except Exception as e:
        logging.error(f"Failed to auto-create delivery: {e}", exc_info=True)
        raise  # Re-raise to abort the transaction properly


def _collect_org(db: Session, principal: CurrentPrincipal, request: Request) -> models.Organization:
    org = None
    if principal.org_id:
        org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if org is None:
        org = resolve_tenant(request, db)
    if org is None:
        raise HTTPException(status_code=404, detail='Organization not found')
    return org


def _get_customer(db: Session, org_id: str, customer_id: str) -> models.Customer:
    cust = db.query(models.Customer).filter(models.Customer.customer_id == customer_id, models.Customer.org_id == org_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail='Customer not found')
    return cust


class InvoiceItem:
    def __init__(self, description: str, qty: int, rate: float):
        self.description = description
        self.qty = qty
        self.rate = rate


def _mock_items_for_customer(customer: models.Customer) -> List[InvoiceItem]:
    # Placeholder: in real system fetch invoice line items from orders DB
    return [
        InvoiceItem('Sample Product A', 2, 150.0),
        InvoiceItem('Sample Product B', 1, 499.0),
    ]


def _build_invoice_number(org_id: str, db: Session) -> str:
    """Generate unique sequential invoice number for the organization"""
    now = datetime.utcnow()
    ymd = now.strftime('%Y%m%d')
    
    # Find the highest invoice number for today to ensure uniqueness
    import json as _json
    from sqlalchemy import text
    
    # Get all invoice numbers for today for this org
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    invoices_today = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org_id,
        models.SyncLog.type == 'invoice_draft',
        models.SyncLog.created_at >= today_start
    ).all()
    
    # Parse existing invoice numbers to find the highest sequence
    max_seq = 0
    prefix = f'INV-{ymd}-'
    for inv in invoices_today:
        try:
            data = _json.loads(inv.payload or '{}')
            inv_no = data.get('invoice_no', '')
            if inv_no.startswith(prefix):
                seq_part = inv_no.replace(prefix, '')
                seq_num = int(seq_part)
                if seq_num > max_seq:
                    max_seq = seq_num
        except (ValueError, KeyError):
            continue
    
    seq = str(max_seq + 1).zfill(4)  # Next sequence number
    return f'INV-{ymd}-{seq}'

def _generate_invoice_id() -> str:
    """Generate unique invoice ID (UUID)"""
    import uuid
    return str(uuid.uuid4())


class InvoiceJSONOut:
    def __init__(self, invoice_no: str, customer: Dict[str, Any], org: Dict[str, Any], items: List[Dict[str, Any]], totals: Dict[str, Any]):
        self.invoice_no = invoice_no
        self.customer = customer
        self.org = org
        self.items = items
        self.totals = totals

    def dict(self):
        return {
            'invoice_no': self.invoice_no,
            'customer': self.customer,
            'org': self.org,
            'items': self.items,
            'totals': self.totals,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }


# Define specific routes BEFORE catch-all {customer_id} routes to avoid conflicts
@router.get('/invoice/drafts', response_model=Dict[str, Any])
def list_invoice_drafts(request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db), limit: int = 50):
    """List recently saved invoice drafts (lightweight) for Orders/Billing roles.
    Returns parsed payloads sorted by newest first.
    """
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to list invoice drafts')
    org = _collect_org(db, principal, request)
    q = db.query(models.SyncLog).filter(models.SyncLog.org_id == org.org_id, models.SyncLog.type == 'invoice_draft').order_by(models.SyncLog.created_at.desc()).limit(min(limit, 200))
    rows = q.all()
    import json as _json
    
    # Fetch all rider assignments for this org in one query (optimized)
    rider_assignments_q = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    # Build a map of invoice_id -> rider_name and assignment_status for quick lookup
    rider_map = {}
    rider_status_map = {}
    
    # First, collect all rider order status changes (accepted, rejected)
    rider_status_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['rider_order_accepted', 'rider_order_rejected'])
    ).all()
    
    # Build a map of invoice_id -> latest status
    status_changes = {}
    for status_log in rider_status_logs:
        try:
            status_data = _json.loads(status_log.payload or '{}')
            inv_id = status_data.get('invoice_id')
            if inv_id:
                # Update status based on log type
                if status_log.type == 'rider_order_accepted':
                    status_changes[inv_id] = 'accepted'
                elif status_log.type == 'rider_order_rejected':
                    status_changes[inv_id] = 'rejected'
        except Exception:
            pass
    
    # Now process assignments
    for ra in rider_assignments_q:
        try:
            ra_data = _json.loads(ra.payload or '{}')
            inv_id = ra_data.get('invoice_id')
            if inv_id and inv_id not in rider_map:  # Keep most recent assignment
                rider_map[inv_id] = ra_data.get('rider_name')
                # Initialize with pending, will be overridden below if status changed
                rider_status_map[inv_id] = 'pending'
        except Exception:
            pass
    
    # Apply status changes to all assigned invoices
    for inv_id, status in status_changes.items():
        if inv_id in rider_map:
            rider_status_map[inv_id] = status
    
    # Fetch rider delivery status logs (accepted, started, completed)
    rider_delivery_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['rider_order_accepted', 'rider_delivery_started', 'delivery_completed'])
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    # Build a map of invoice_id -> rider delivery status
    rider_delivery_status_map = {}
    for rdl in rider_delivery_logs:
        try:
            rdl_data = _json.loads(rdl.payload or '{}')
            inv_id = rdl_data.get('invoice_id')
            if inv_id and inv_id not in rider_delivery_status_map:
                # Map rider log types to shipment-like status
                if rdl.type == 'delivery_completed':
                    rider_delivery_status_map[inv_id] = 'delivered'
                elif rdl.type == 'rider_delivery_started':
                    rider_delivery_status_map[inv_id] = 'in_transit'
                elif rdl.type == 'rider_order_accepted':
                    rider_delivery_status_map[inv_id] = 'pending'
        except Exception:
            pass
    
    # Fetch shipment assignments for all invoices (optimized)
    shipment_events_q = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    # Build a map of invoice_id -> shipment data (most recent event wins)
    shipment_map = {}
    for se in shipment_events_q:
        try:
            se_data = _json.loads(se.payload or '{}')
            inv_id = se_data.get('invoice_id')
            if inv_id and inv_id not in shipment_map:
                # Since we're ordering by created_at desc, first occurrence is most recent
                shipment_map[inv_id] = se_data
        except Exception:
            pass
    
    # Fetch user names for created_by tracking
    user_ids = list(set([r.user_id for r in rows if r.user_id] + [getattr(r, 'created_by', None) for r in rows if getattr(r, 'created_by', None)]))
    users_q = db.query(models.User).filter(models.User.user_id.in_(user_ids)).all() if user_ids else []
    user_map = {u.user_id: u.name or u.email for u in users_q}
    
    drafts = []
    for r in rows:
        try:
            data = _json.loads(r.payload or '{}')
        except Exception:
            data = {}
        invoice_id = data.get('invoice_id')
        shipment_info = shipment_map.get(invoice_id)
        rider_delivery_status = rider_delivery_status_map.get(invoice_id)
        shipment_status = None
        if shipment_info:
            shipment_status = shipment_info.get('status', 'pending')
            if rider_delivery_status == 'delivered' and shipment_status != 'delivered':
                shipment_status = 'delivered'
        else:
            shipment_status = rider_delivery_status
        
        # Get customer phone - try from invoice data first, then customer record
        customer_phone = None
        customer_name = None
        customer_company_name = None
        customer_id = data.get('customer_id')
        
        # First try to get from invoice billing_phone (most recent)
        customer_phone = data.get('billing_phone') or data.get('customer_phone')
        customer_name = data.get('customer_name')
        customer_company_name = data.get('customer_company_name')
        
        # If not in invoice data, try from Customer table
        if customer_id and (not customer_phone or not customer_name or not customer_company_name):
            try:
                cust = db.query(models.Customer).filter(
                    models.Customer.org_id == org.org_id,
                    models.Customer.customer_id == customer_id
                ).first()
                if cust:
                    if not customer_phone:
                        customer_phone = cust.phone
                    if not customer_name:
                        # Prioritize company_name for B2B or when name is empty
                        if cust.company_name and (not cust.name or (cust.ctype and cust.ctype.upper() == 'B2B')):
                            customer_name = cust.company_name
                        elif cust.name:
                            customer_name = cust.name
                        elif cust.company_name:
                            customer_name = cust.company_name
                    if not customer_company_name:
                        customer_company_name = cust.company_name
            except Exception:
                pass
        
        drafts.append({
            'id': r.id,
            'created_at': r.created_at.isoformat() + 'Z',
            'created_by': getattr(r, 'created_by', r.user_id),  # Use new field or fallback to user_id
            'created_by_name': user_map.get(getattr(r, 'created_by', r.user_id)),  # User name
            'invoice_id': invoice_id,
            'invoice_no': data.get('invoice_no'),
            'customer_id': customer_id,
            'customer_name': customer_name,
            'customer_company_name': customer_company_name,
            'customer_phone': customer_phone,
            'totals': data.get('totals') or {},
            'items_count': len(data.get('items') or []),
            'rider_name': rider_map.get(invoice_id),  # Include rider assignment
            'rider_assignment_status': rider_status_map.get(invoice_id),  # pending, accepted, rejected
            'delivery_latitude': data.get('delivery_latitude'),  # WhatsApp location coordinates
            'delivery_longitude': data.get('delivery_longitude'),
            'delivery_address': data.get('delivery_address'),
            'shipment': {
                'provider_name': shipment_info.get('provider_name') if shipment_info else (rider_map.get(invoice_id) if rider_map.get(invoice_id) else None),
                'provider_code': shipment_info.get('provider_code') if shipment_info else ('rider' if rider_map.get(invoice_id) else None),
                'tracking_number': shipment_info.get('tracking_number') if shipment_info else None,
                'status': shipment_status,
                'shipping_address': shipment_info.get('shipping_address') if shipment_info else None,
            } if shipment_info or rider_map.get(invoice_id) else None,
        })
    return {'drafts': drafts, 'count': len(drafts)}


@router.get('/invoice/{customer_id}', response_model=Dict[str, Any])
def get_invoice_json(customer_id: str, request: Request, create: bool = False, invoice_id: str = None, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to view invoice')
    org = _collect_org(db, principal, request)
    cust = _get_customer(db, org.org_id, customer_id)
    items = _mock_items_for_customer(cust)
    subtotal = sum(i.qty * i.rate for i in items)
    
    # Check if invoice has been saved (exists as draft in database)
    # Skip this check if create=true (forcing new invoice creation)
    import json as _json
    invoice_no = None
    
    if not create:
        saved_invoice = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == org.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).order_by(models.SyncLog.created_at.desc()).all()
        
        for draft in saved_invoice:
            try:
                draft_data = _json.loads(draft.payload or '{}')
                # If invoice_id is provided, match by invoice_id for specific invoice
                # Otherwise, match by customer_id for the latest invoice of that customer
                if invoice_id:
                    if draft_data.get('invoice_id') == invoice_id and draft_data.get('customer_id') == customer_id:
                        invoice_no = draft_data.get('invoice_no')
                        # Use saved items if available
                        if draft_data.get('items'):
                            items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                            subtotal = sum(i.qty * i.rate for i in items)
                        break
                else:
                    if draft_data.get('customer_id') == customer_id:
                        invoice_no = draft_data.get('invoice_no')
                        # Use saved items if available
                        if draft_data.get('items'):
                            items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                            subtotal = sum(i.qty * i.rate for i in items)
                        break
            except (ValueError, KeyError):
                pass
    
    # If no saved invoice, generate a preview number (but don't return it as invoice_no)
    preview_no = _build_invoice_number(org.org_id, db) if not invoice_no else invoice_no
    
    # Business settings subset
    bset = (org.settings or {}).get('business') or (org.settings or {}).get('business_settings') or {}
    org_out = {
        'name': org.name,
        'slug': org.slug,
        'business_settings': {k: bset.get(k) for k in ['address','logo_data_url','gstin','company_registration','drug_license','fssai']},
    }
    cust_out = {
        'customer_id': cust.customer_id,
        'ctype': cust.ctype,
        'name': cust.name,
        'company_name': cust.company_name,
        'gstin': cust.gstin,
        'email': cust.email,
        'phone': cust.phone,
        'address': cust.address,
        'city': cust.city,
        'state': cust.state,
        'pin': cust.pin,
    }
    # Only include invoice_no in response if invoice has been saved
    out = InvoiceJSONOut(invoice_no, cust_out, org_out, [
        {'description': it.description, 'qty': it.qty, 'rate': it.rate, 'amount': it.qty * it.rate} for it in items
    ], {'subtotal': subtotal, 'total': subtotal})
    result = out.dict()
    # Add preview number for display purposes
    result['preview_no'] = preview_no
    return result


@router.get('/invoice/{customer_id}/pdf')
def get_invoice_pdf(customer_id: str, request: Request, invoice_id: str = None, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    logger = logging.getLogger('invoice')
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to download invoice')
    try:
        org = _collect_org(db, principal, request)
        cust = _get_customer(db, org.org_id, customer_id)
        items = _mock_items_for_customer(cust)
        subtotal = sum(i.qty * i.rate for i in items)
        invoice_no = _build_invoice_number(org.org_id, db)
        
        # Check if invoice has been saved (exists as draft in database)
        import json as _json
        saved_invoice = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == org.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).order_by(models.SyncLog.created_at.desc()).all()
        
        current_invoice_id = None
        for draft in saved_invoice:
            try:
                draft_data = _json.loads(draft.payload or '{}')
                # If invoice_id is provided, match by invoice_id for specific invoice
                # Otherwise, match by customer_id for the latest invoice of that customer
                if invoice_id:
                    if draft_data.get('invoice_id') == invoice_id and draft_data.get('customer_id') == customer_id:
                        invoice_no = draft_data.get('invoice_no') or invoice_no
                        current_invoice_id = draft_data.get('invoice_id')
                        # Use saved items if available
                        if draft_data.get('items'):
                            items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                            subtotal = sum(i.qty * i.rate for i in items)
                        break
                else:
                    if draft_data.get('customer_id') == customer_id:
                        invoice_no = draft_data.get('invoice_no') or invoice_no
                        current_invoice_id = draft_data.get('invoice_id')
                        # Use saved items if available
                        if draft_data.get('items'):
                            items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                            subtotal = sum(i.qty * i.rate for i in items)
                        break
            except (ValueError, KeyError):
                pass
        
        # Get shipping address from shipment data
        shipping_address = None
        if current_invoice_id:
            shipment_events = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == org.org_id,
                models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
            ).order_by(models.SyncLog.created_at.desc()).all()
            
            for se in shipment_events:
                try:
                    se_data = _json.loads(se.payload or '{}')
                    if se_data.get('invoice_id') == current_invoice_id:
                        # Always update shipping_address when we find matching invoice
                        if se_data.get('shipping_address'):
                            shipping_address = se_data.get('shipping_address')
                        # If we have an update event, stop here (it takes precedence)
                        if se.type == 'invoice_shipment_updated':
                            break
                except Exception:
                    pass
        
        # Get org settings for logo and business info
        org_settings = org.settings or {}
        business_settings = org_settings.get('business_settings') or {}
        
        pdf = FPDF(format='A4')
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        
        # Header with company info
        pdf.set_font('Helvetica', 'B', 20)
        pdf.cell(0, 10, org.name or 'INVOICE', ln=1, align='C')
        pdf.ln(2)
        
        # Company address if available
        if business_settings.get('address'):
            pdf.set_font('Helvetica', '', 9)
            pdf.multi_cell(0, 4, business_settings.get('address', ''), align='C')
        
        # GSTIN and other details
        comp_details = []
        if business_settings.get('gstin'):
            comp_details.append(f"GSTIN: {business_settings['gstin']}")
        if business_settings.get('company_registration'):
            comp_details.append(f"Reg No: {business_settings['company_registration']}")
        if comp_details:
            pdf.set_font('Helvetica', '', 8)
            pdf.cell(0, 4, ' | '.join(comp_details), ln=1, align='C')
        
        pdf.ln(5)
        
        # Invoice details in two columns
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(95, 6, f'Invoice No: {invoice_no}', border=0)
        pdf.cell(95, 6, f'Date: {datetime.utcnow().strftime("%d-%b-%Y")}', ln=1, align='R')
        
        pdf.ln(5)
        
        # Bill To section
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(0, 7, 'BILL TO', ln=1, fill=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.ln(2)
        
        # Customer details
        if cust.company_name:
            pdf.cell(0, 5, cust.company_name, ln=1)
        if cust.name:
            pdf.cell(0, 5, cust.name, ln=1)
        if cust.address:
            pdf.cell(0, 5, cust.address, ln=1)
        
        city_state_pin = f"{cust.city or ''} {cust.state or ''} {cust.pin or ''}".strip()
        if city_state_pin:
            pdf.cell(0, 5, city_state_pin, ln=1)
        
        if cust.phone:
            pdf.cell(0, 5, f"Phone: {cust.phone}", ln=1)
        if cust.email:
            pdf.cell(0, 5, f"Email: {cust.email}", ln=1)
        if cust.gstin:
            pdf.cell(0, 5, f"GSTIN: {cust.gstin}", ln=1)
        
        pdf.ln(8)
        
        # Ship To section (if shipping address exists and is different)
        if shipping_address and shipping_address.strip():
            pdf.set_font('Helvetica', 'B', 11)
            pdf.set_fill_color(240, 240, 240)
            pdf.cell(0, 7, 'SHIP TO', ln=1, fill=True)
            pdf.set_font('Helvetica', '', 10)
            pdf.ln(2)
            pdf.multi_cell(0, 5, shipping_address)
            pdf.ln(5)
        
        pdf.ln(3)
        
        # Items table header
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_fill_color(200, 220, 240)
        pdf.cell(10, 7, '#', border=1, fill=True, align='C')
        pdf.cell(90, 7, 'Description', border=1, fill=True)
        pdf.cell(25, 7, 'Qty', border=1, fill=True, align='C')
        pdf.cell(30, 7, 'Rate', border=1, fill=True, align='R')
        pdf.cell(35, 7, 'Amount', border=1, fill=True, align='R', ln=1)
        
        # Items table body
        pdf.set_font('Helvetica', '', 9)
        for idx, it in enumerate(items, 1):
            pdf.cell(10, 6, str(idx), border=1, align='C')
            pdf.cell(90, 6, it.description[:45], border=1)
            pdf.cell(25, 6, str(int(it.qty)), border=1, align='C')
            pdf.cell(30, 6, f'{it.rate:.2f}', border=1, align='R')
            pdf.cell(35, 6, f'{(it.qty * it.rate):.2f}', border=1, align='R', ln=1)
        
        pdf.ln(5)
        
        # Totals section
        pdf.set_font('Helvetica', 'B', 11)
        pdf.cell(125, 7, '', border=0)
        pdf.cell(30, 7, 'Subtotal:', border=0, align='R')
        pdf.cell(35, 7, f'Rs. {subtotal:.2f}', border=0, align='R', ln=1)
        
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(125, 8, '', border=0)
        pdf.cell(30, 8, 'TOTAL:', border='T', align='R')
        pdf.cell(35, 8, f'Rs. {subtotal:.2f}', border='T', align='R', ln=1)
        
        pdf.ln(10)
        
        # Footer
        pdf.set_font('Helvetica', 'I', 8)
        pdf.set_text_color(128, 128, 128)
        pdf.cell(0, 5, 'Thank you for your business!', ln=1, align='C')
        
        # FPDF output returns bytearray in newer versions, not string
        pdf_output = pdf.output(dest='S')
        if isinstance(pdf_output, bytes):
            pdf_bytes = pdf_output
        elif isinstance(pdf_output, bytearray):
            pdf_bytes = bytes(pdf_output)
        else:
            # Old version returns string
            pdf_bytes = pdf_output.encode('latin-1')
        
        # Best-effort: log who downloaded the invoice
        try:
            from .. import models as _models  # local alias not strictly needed
            ev = models.SyncLog(
                org_id=org.org_id,
                user_id=principal.user_id,
                type='invoice_downloaded',
                payload=(__import__('json').dumps({
                    'customer_id': cust.customer_id,
                    'invoice_no': invoice_no,
                    'downloaded_at': datetime.utcnow().isoformat() + 'Z',
                }))
            )
            db.add(ev)
            db.commit()
        except Exception:
            pass
        headers = {
            'Content-Type': 'application/pdf',
            'Content-Disposition': f'attachment; filename="{invoice_no}.pdf"'
        }
        return Response(content=pdf_bytes, media_type='application/pdf', headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception('Failed to generate invoice PDF')
        raise HTTPException(status_code=500, detail=f'PDF generation failed: {e}')


class EmailInvoiceIn(BaseModel):
    recipients: List[str]
    subject: Optional[str] = None
    message: Optional[str] = None


class SaveInvoiceIn(BaseModel):
    items: Optional[List[Dict[str, Any]]] = None
    ship_to_same: Optional[bool] = True
    ship_to_address: Optional[str] = None
    totals: Optional[Dict[str, Any]] = None
    invoice_no: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None


@router.post('/invoice/{customer_id}/save', response_model=Dict[str, Any])
def save_invoice(customer_id: str, payload: SaveInvoiceIn, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to save invoice')
    org = _collect_org(db, principal, request)
    cust = _get_customer(db, org.org_id, customer_id)
    
    # Generate unique invoice ID and number
    invoice_id = _generate_invoice_id()
    invoice_no = (payload.invoice_no or '').strip() or _build_invoice_number(org.org_id, db)
    
    # Determine customer name - prioritize company_name for B2B or when name is empty
    if cust.company_name and (not cust.name or (cust.ctype and cust.ctype.upper() == 'B2B')):
        display_customer_name = cust.company_name
    elif cust.name:
        display_customer_name = cust.name
    elif cust.company_name:
        display_customer_name = cust.company_name
    else:
        display_customer_name = "Unknown Customer"
    
    # Persist a draft entry to SyncLog for traceability (lightweight storage without invoices table)
    data = {
        'org_id': org.org_id,
        'invoice_id': invoice_id,
        'customer_id': cust.customer_id,
        'customer_name': display_customer_name,  # Use computed display name
        'customer_company_name': cust.company_name,
        'customer_phone': cust.phone,
        'customer_address': cust.address,
        'invoice_no': invoice_no,
        'items': payload.items or [],
        'ship_to_same': bool(payload.ship_to_same) if payload.ship_to_same is not None else True,
        'ship_to_address': payload.ship_to_address or None,
        'totals': payload.totals or {},
        'saved_at': datetime.utcnow().isoformat() + 'Z',
        'delivery_latitude': payload.delivery_latitude,
        'delivery_longitude': payload.delivery_longitude,
    }
    try:
        entry = models.SyncLog(org_id=org.org_id, user_id=principal.user_id, type='invoice_draft', payload=_json.dumps(data))
        db.add(entry)
        
        # Auto-create delivery record for rider access
        delivery_id = _auto_create_delivery(db, org.org_id, invoice_id, cust.customer_id, data)
        
        db.commit()
        
        result = {'status': 'ok', 'invoice_id': invoice_id, 'invoice_no': invoice_no}
        if delivery_id:
            result['delivery_id'] = delivery_id
            result['delivery_created'] = True
        
        return result
        
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to save invoice: {e}")
        raise HTTPException(status_code=500, detail='Failed to save invoice draft')


@router.delete('/invoice/draft/{draft_id}', response_model=Dict[str, Any])
def delete_invoice_draft(draft_id: int, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Delete an invoice draft and all related audit records"""
    import logging
    logger = logging.getLogger(__name__)
    
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to delete invoice')
    org = _collect_org(db, principal, request)
    
    # Find the draft entry
    draft = db.query(models.SyncLog).filter(
        models.SyncLog.id == draft_id,
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type == 'invoice_draft'
    ).first()
    
    if not draft:
        raise HTTPException(status_code=404, detail='Invoice draft not found')
    
    # Get invoice_id from the draft payload
    import json as _json
    deleted_count = 0
    invoice_id = None
    
    try:
        draft_data = _json.loads(draft.payload or '{}')
        invoice_id = draft_data.get('invoice_id')
        logger.info(f"Deleting invoice draft {draft_id}, invoice_id: {invoice_id}")
        
        if invoice_id:
            # Delete all related records for this invoice_id
            # 1. Delete rider assignments (audit records)
            assignments = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == org.org_id,
                models.SyncLog.type == 'invoice_rider_assigned'
            ).all()
            
            logger.info(f"Found {len(assignments)} total assignments to check")
            
            for assignment in assignments:
                try:
                    assignment_data = _json.loads(assignment.payload or '{}')
                    assignment_invoice_id = assignment_data.get('invoice_id')
                    if assignment_invoice_id == invoice_id:
                        logger.info(f"Deleting assignment {assignment.id} for invoice {invoice_id}")
                        db.delete(assignment)
                        deleted_count += 1
                except Exception as e:
                    logger.error(f"Error checking assignment {assignment.id}: {e}")
            
            # 2. Delete tracking updates
            tracking_updates = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == org.org_id,
                models.SyncLog.type == 'invoice_tracking_update'
            ).all()
            
            for tracking in tracking_updates:
                try:
                    tracking_data = _json.loads(tracking.payload or '{}')
                    if tracking_data.get('invoice_id') == invoice_id:
                        logger.info(f"Deleting tracking update {tracking.id} for invoice {invoice_id}")
                        db.delete(tracking)
                        deleted_count += 1
                except Exception as e:
                    logger.error(f"Error checking tracking {tracking.id}: {e}")
                    
            # 3. Delete delivery_completed records
            delivery_logs = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == org.org_id,
                models.SyncLog.type == 'delivery_completed'
            ).all()
            
            for dlog in delivery_logs:
                try:
                    dlog_data = _json.loads(dlog.payload or '{}')
                    if dlog_data.get('invoice_id') == invoice_id:
                        logger.info(f"Deleting delivery_completed {dlog.id} for invoice {invoice_id}")
                        db.delete(dlog)
                        deleted_count += 1
                except Exception as e:
                    logger.error(f"Error checking delivery log {dlog.id}: {e}")
                    
    except Exception as e:
        logger.error(f"Error during delete cascade: {e}")
    
    # Delete the draft itself
    logger.info(f"Deleting draft {draft_id}")
    db.delete(draft)
    db.commit()
    
    logger.info(f"Deleted invoice {invoice_id}: draft + {deleted_count} related records")
    return {'status': 'ok', 'deleted_id': draft_id, 'invoice_id': invoice_id, 'related_records_deleted': deleted_count}


class AssignRiderIn(BaseModel):
    rider_user_id: str
    invoice_id: str  # Add invoice_id to payload


@router.post('/invoice/{customer_id}/assign-rider', response_model=Dict[str, Any])
def assign_invoice_rider(customer_id: str, payload: AssignRiderIn, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to assign rider')
    org = _collect_org(db, principal, request)
    cust = _get_customer(db, org.org_id, customer_id)
    
    # Check if THIS SPECIFIC INVOICE already has a rider assigned
    import json as _json
    if payload.invoice_id:
        existing_assignments = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == org.org_id,
            models.SyncLog.type == 'invoice_rider_assigned'
        ).all()
        
        for assignment in existing_assignments:
            try:
                assignment_data = _json.loads(assignment.payload or '{}')
                if assignment_data.get('invoice_id') == payload.invoice_id:
                    # Check if assignment is accepted - can't reassign if accepted
                    current_status = assignment_data.get('assignment_status', 'accepted')
                    if current_status == 'accepted':
                        raise HTTPException(status_code=400, detail='This invoice has been accepted by a rider. Cannot reassign.')
                    # If pending or rejected, delete old assignment to allow new one
                    db.delete(assignment)
                    db.flush()
                    break  # Exit loop after handling the assignment
            except HTTPException:
                raise  # Re-raise HTTP exceptions
            except (ValueError, KeyError):
                pass
    
    # Validate rider exists in org
    rider = db.query(models.User).filter(models.User.user_id == payload.rider_user_id, models.User.org_id == org.org_id).first()
    if not rider or (rider.role or '').lower() != 'rider':
        raise HTTPException(status_code=404, detail='Rider not found')
    
    # Log assignment for downstream processing
    data = {
        'org_id': org.org_id,
        'invoice_id': payload.invoice_id,
        'customer_id': cust.customer_id,
        'rider_user_id': rider.user_id,
        'rider_name': rider.name or rider.email,
        'assigned_at': datetime.utcnow().isoformat() + 'Z',
        'assignment_status': 'pending',  # pending, accepted, rejected
    }
    entry = models.SyncLog(org_id=org.org_id, user_id=principal.user_id, type='invoice_rider_assigned', payload=_json.dumps(data))
    db.add(entry)
    
    # Update Delivery record
    delivery = db.query(models.Delivery).filter(
        models.Delivery.org_id == org.org_id,
        models.Delivery.order_id == payload.invoice_id
    ).first()
    
    if delivery:
        delivery.assigned_rider_id = rider.user_id
        delivery.status = 'assigned'
        delivery.assigned_at = datetime.utcnow()
        logging.info(f"Updated delivery {delivery.delivery_id} with rider {rider.user_id}")
    else:
        logging.warning(f"No delivery record found for invoice {payload.invoice_id} when assigning rider")
        
    db.commit()
    return {'status': 'ok', 'rider_user_id': rider.user_id, 'assignment_status': 'pending'}


@router.get('/invoice/{customer_id}/timeline', response_model=Dict[str, Any])
def get_invoice_timeline(customer_id: str, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db), limit: int = 200):
    """Lifecycle timeline for a customer's invoices using SyncLog events."""
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to view timeline')
    org = _collect_org(db, principal, request)
    # Ensure customer exists for this org
    _ = _get_customer(db, org.org_id, customer_id)
    q = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['invoice_draft','invoice_email_sent','invoice_rider_assigned','invoice_downloaded'])
    ).order_by(models.SyncLog.created_at.desc()).limit(limit)
    rows = q.all()
    import json as _json
    tl = []
    for r in rows:
        try:
            data = _json.loads(r.payload or '{}')
        except Exception:
            data = {}
        if data.get('customer_id') != customer_id:
            continue
        tl.append({'id': r.id, 'type': r.type, 'at': r.created_at.isoformat() + 'Z', 'data': data})
    return {'timeline': tl, 'count': len(tl)}


@router.post('/invoice/{invoice_id}/rider-response', response_model=Dict[str, Any])
def rider_assignment_response(invoice_id: str, payload: dict, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Rider accepts or rejects an assignment"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can respond to assignments')
    
    action = payload.get('action')  # 'accept' or 'reject'
    if action not in ['accept', 'reject']:
        raise HTTPException(status_code=400, detail='Action must be accept or reject')
    
    # Find the assignment for this invoice and rider
    import json as _json
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assignment_log = None
    for assignment in assignments:
        try:
            data = _json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
                assignment_log = assignment
                assignment_data = data
                break
        except:
            pass
    
    if not assignment_log:
        raise HTTPException(status_code=404, detail='Assignment not found')
    
    # Update the assignment status
    assignment_data['assignment_status'] = 'accepted' if action == 'accept' else 'rejected'
    assignment_data['responded_at'] = datetime.utcnow().isoformat() + 'Z'
    assignment_log.payload = _json.dumps(assignment_data)
    
    db.commit()
    
    return {
        'status': 'ok',
        'invoice_id': invoice_id,
        'assignment_status': assignment_data['assignment_status']
    }


@router.post('/invoice/{customer_id}/email', response_model=Dict[str, Any])
def email_invoice_pdf(customer_id: str, payload: EmailInvoiceIn, request: Request, invoice_id: str = None, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to email invoice')
    if not payload.recipients:
        raise HTTPException(status_code=400, detail='Recipients required')
    org = _collect_org(db, principal, request)
    cust = _get_customer(db, org.org_id, customer_id)
    items = _mock_items_for_customer(cust)
    subtotal = sum(i.qty * i.rate for i in items)
    invoice_no = _build_invoice_number(org.org_id, db)
    
    # Check if invoice has been saved (exists as draft in database)
    import json as _json
    saved_invoice = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type == 'invoice_draft'
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    for draft in saved_invoice:
        try:
            draft_data = _json.loads(draft.payload or '{}')
            # If invoice_id is provided, match by invoice_id for specific invoice
            # Otherwise, match by customer_id for the latest invoice of that customer
            if invoice_id:
                if draft_data.get('invoice_id') == invoice_id and draft_data.get('customer_id') == customer_id:
                    invoice_no = draft_data.get('invoice_no') or invoice_no
                    # Use saved items if available
                    if draft_data.get('items'):
                        items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                        subtotal = sum(i.qty * i.rate for i in items)
                    break
            else:
                if draft_data.get('customer_id') == customer_id:
                    invoice_no = draft_data.get('invoice_no') or invoice_no
                    # Use saved items if available
                    if draft_data.get('items'):
                        items = [InvoiceItem(description=it.get('description', ''), qty=it.get('qty', 0), rate=it.get('rate', 0.0)) for it in draft_data['items']]
                        subtotal = sum(i.qty * i.rate for i in items)
                    break
        except (ValueError, KeyError):
            pass
    
    # Get org settings for business info
    org_settings = org.settings or {}
    business_settings = org_settings.get('business_settings') or {}
    
    # Build PDF
    pdf = FPDF(format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    # Header with company info
    pdf.set_font('Helvetica', 'B', 20)
    pdf.cell(0, 10, org.name or 'INVOICE', ln=1, align='C')
    pdf.ln(2)
    
    # Company address if available
    if business_settings.get('address'):
        pdf.set_font('Helvetica', '', 9)
        pdf.multi_cell(0, 4, business_settings.get('address', ''), align='C')
    
    # GSTIN and other details
    comp_details = []
    if business_settings.get('gstin'):
        comp_details.append(f"GSTIN: {business_settings['gstin']}")
    if business_settings.get('company_registration'):
        comp_details.append(f"Reg No: {business_settings['company_registration']}")
    if comp_details:
        pdf.set_font('Helvetica', '', 8)
        pdf.cell(0, 4, ' | '.join(comp_details), ln=1, align='C')
    
    pdf.ln(5)
    
    # Invoice details in two columns
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(95, 6, f'Invoice No: {invoice_no}', border=0)
    pdf.cell(95, 6, f'Date: {datetime.utcnow().strftime("%d-%b-%Y")}', ln=1, align='R')
    
    pdf.ln(5)
    
    # Bill To section
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(0, 7, 'BILL TO', ln=1, fill=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.ln(2)
    
    # Customer details
    if cust.company_name:
        pdf.cell(0, 5, cust.company_name, ln=1)
    if cust.name:
        pdf.cell(0, 5, cust.name, ln=1)
    if cust.address:
        pdf.cell(0, 5, cust.address, ln=1)
    
    city_state_pin = f"{cust.city or ''} {cust.state or ''} {cust.pin or ''}".strip()
    if city_state_pin:
        pdf.cell(0, 5, city_state_pin, ln=1)
    
    if cust.phone:
        pdf.cell(0, 5, f"Phone: {cust.phone}", ln=1)
    if cust.email:
        pdf.cell(0, 5, f"Email: {cust.email}", ln=1)
    if cust.gstin:
        pdf.cell(0, 5, f"GSTIN: {cust.gstin}", ln=1)
    
    pdf.ln(8)
    
    # Items table header
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(200, 220, 240)
    pdf.cell(10, 7, '#', border=1, fill=True, align='C')
    pdf.cell(90, 7, 'Description', border=1, fill=True)
    pdf.cell(25, 7, 'Qty', border=1, fill=True, align='C')
    pdf.cell(30, 7, 'Rate', border=1, fill=True, align='R')
    pdf.cell(35, 7, 'Amount', border=1, fill=True, align='R', ln=1)
    
    # Items table body
    pdf.set_font('Helvetica', '', 9)
    for idx, it in enumerate(items, 1):
        pdf.cell(10, 6, str(idx), border=1, align='C')
        pdf.cell(90, 6, it.description[:45], border=1)
        pdf.cell(25, 6, str(int(it.qty)), border=1, align='C')
        pdf.cell(30, 6, f'{it.rate:.2f}', border=1, align='R')
        pdf.cell(35, 6, f'{(it.qty * it.rate):.2f}', border=1, align='R', ln=1)
    
    pdf.ln(5)
    
    # Totals section
    pdf.set_font('Helvetica', 'B', 11)
    pdf.cell(125, 7, '', border=0)
    pdf.cell(30, 7, 'Subtotal:', border=0, align='R')
    pdf.cell(35, 7, f'Rs. {subtotal:.2f}', border=0, align='R', ln=1)
    
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(125, 8, '', border=0)
    pdf.cell(30, 8, 'TOTAL:', border='T', align='R')
    pdf.cell(35, 8, f'Rs. {subtotal:.2f}', border='T', align='R', ln=1)
    
    pdf.ln(10)
    
    # Footer
    pdf.set_font('Helvetica', 'I', 8)
    pdf.set_text_color(128, 128, 128)
    pdf.cell(0, 5, 'Thank you for your business!', ln=1, align='C')
    
    # FPDF output returns bytearray in newer versions, not string
    pdf_output = pdf.output(dest='S')
    if isinstance(pdf_output, bytes):
        pdf_bytes = pdf_output
    elif isinstance(pdf_output, bytearray):
        pdf_bytes = bytes(pdf_output)
    else:
        # Old version returns string
        pdf_bytes = pdf_output.encode('latin-1')

    # Email settings
    email_cfg = (org.settings or {}).get('email') or (org.settings or {}).get('email_settings') or {}
    host = email_cfg.get('smtp_host'); port = int(email_cfg.get('smtp_port') or 587)
    user = email_cfg.get('smtp_user'); pwd = email_cfg.get('smtp_password')
    from_email = email_cfg.get('from_email') or user
    if not (host and port and user and pwd and from_email):
        raise HTTPException(status_code=400, detail='Email settings incomplete; configure SMTP first')

    subj = payload.subject or f'Invoice {invoice_no} from {org.name}'
    body_html = payload.message or f'<p>Attached invoice {invoice_no}.</p>'
    msg = MIMEMultipart()
    msg['Subject'] = subj
    msg['From'] = from_email
    msg['To'] = ', '.join(payload.recipients)
    msg['Date'] = formatdate(localtime=True)
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))
    part = MIMEApplication(pdf_bytes, _subtype='pdf')
    part.add_header('Content-Disposition', 'attachment', filename=f'{invoice_no}.pdf')
    msg.attach(part)

    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            if port in (587,25):
                server.starttls(); server.ehlo()
            server.login(user, pwd)
            server.sendmail(from_email, payload.recipients, msg.as_string())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to send email: {e}')

    # Log email event (best effort)
    try:
        import json as _json
        ev = models.SyncLog(
            org_id=org.org_id,
            user_id=principal.user_id,
            type='invoice_email_sent',
            payload=_json.dumps({
                'customer_id': cust.customer_id,
                'invoice_no': invoice_no,
                'recipients': payload.recipients,
                'subject': subj,
                'sent_at': datetime.utcnow().isoformat() + 'Z',
            })
        )
        db.add(ev)
        db.commit()
    except Exception:
        pass

    return {'status':'ok','invoice_no': invoice_no, 'sent': len(payload.recipients)}


class ShipmentAssignPayload(BaseModel):
    invoice_id: str
    provider_id: str


class ShipmentUpdatePayload(BaseModel):
    invoice_id: str
    tracking_number: str
    status: Optional[str] = None  # 'pending', 'in_transit', 'delivered'


@router.post('/invoice/shipment/assign')
def assign_shipment_provider(payload: ShipmentAssignPayload, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Assign a shipment provider to an invoice"""
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to assign shipment')
    org = _collect_org(db, principal, request)
    
    # Verify provider exists and is active
    provider = db.query(models.ShipmentProvider).filter(
        models.ShipmentProvider.provider_id == payload.provider_id,
        models.ShipmentProvider.active == True  # noqa: E712
    ).first()
    if not provider:
        raise HTTPException(status_code=404, detail='Shipment provider not found')
    
    import json as _json
    # Create shipment assignment event
    ev = models.SyncLog(
        org_id=org.org_id,
        user_id=principal.user_id,
        type='invoice_shipment_assigned',
        payload=_json.dumps({
            'invoice_id': payload.invoice_id,
            'provider_id': provider.provider_id,
            'provider_name': provider.name,
            'provider_code': provider.code,
            'tracking_url': provider.tracking_url,
            'status': 'pending',
            'assigned_at': datetime.utcnow().isoformat() + 'Z',
            'assigned_by': principal.user_id,
        })
    )
    db.add(ev)
    db.commit()
    
    return {
        'status': 'ok',
        'provider_name': provider.name,
        'provider_code': provider.code,
    }


@router.post('/invoice/shipment/update')
def update_shipment_tracking(payload: ShipmentUpdatePayload, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Update shipment tracking number and status"""
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to update shipment')
    org = _collect_org(db, principal, request)
    
    import json as _json
    # Get the latest shipment assignment for this invoice
    shipment = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type == 'invoice_shipment_assigned'
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    provider_data = None
    for s in shipment:
        try:
            s_data = _json.loads(s.payload or '{}')
            if s_data.get('invoice_id') == payload.invoice_id:
                provider_data = s_data
                break
        except Exception:
            pass
    
    if not provider_data:
        raise HTTPException(status_code=404, detail='No shipment assigned to this invoice')
    
    # Determine status based on tracking number and explicit status
    status = payload.status if payload.status else 'in_transit'
    
    # Create shipment update event
    ev = models.SyncLog(
        org_id=org.org_id,
        user_id=principal.user_id,
        type='invoice_shipment_updated',
        payload=_json.dumps({
            'invoice_id': payload.invoice_id,
            'provider_id': provider_data.get('provider_id'),
            'provider_name': provider_data.get('provider_name'),
            'provider_code': provider_data.get('provider_code'),
            'tracking_url': provider_data.get('tracking_url'),
            'tracking_number': payload.tracking_number,
            'status': status,
            'updated_at': datetime.utcnow().isoformat() + 'Z',
            'updated_by': principal.user_id,
        })
    )
    db.add(ev)
    db.commit()
    
    return {
        'status': 'ok',
        'tracking_number': payload.tracking_number,
        'shipment_status': status,
    }


@router.get('/invoice/shipment/{invoice_id}')
def get_shipment_status(invoice_id: str, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get current shipment status for an invoice"""
    import logging
    logger = logging.getLogger("uvicorn")
    
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to view shipment')
    org = _collect_org(db, principal, request)
    
    logger.info(f"Getting shipment for invoice_id={invoice_id}, org_id={org.org_id}")
    
    import json as _json
    # Get the latest shipment update or assignment
    events = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    logger.info(f"Found {len(events)} total shipment events")
    
    shipment_data = None
    for ev in events:
        try:
            ev_data = _json.loads(ev.payload or '{}')
            if ev_data.get('invoice_id') == invoice_id:
                # Always update shipment_data when we find a matching invoice
                shipment_data = ev_data
                logger.info(f"Found matching event: type={ev.type}, has_shipping_address={('shipping_address' in shipment_data)}, address={shipment_data.get('shipping_address', 'NONE')[:50] if shipment_data.get('shipping_address') else 'NULL'}")
                # If we have an update, it takes precedence - stop here
                if ev.type == 'invoice_shipment_updated':
                    break
        except Exception as e:
            logger.error(f"Error parsing event: {e}")
            pass
    
    if not shipment_data:
        logger.info("No shipment data found")
        return {'status': 'not_assigned', 'shipment': None}
    
    result = {
        'status': 'ok',
        'shipment': {
            'provider_name': shipment_data.get('provider_name'),
            'provider_code': shipment_data.get('provider_code'),
            'tracking_url': shipment_data.get('tracking_url'),
            'tracking_number': shipment_data.get('tracking_number'),
            'status': shipment_data.get('status', 'pending'),
            'shipping_address': shipment_data.get('shipping_address'),
            'assigned_at': shipment_data.get('assigned_at'),
            'updated_at': shipment_data.get('updated_at'),
        }
    }
    logger.info(f"Returning shipment with shipping_address={result['shipment'].get('shipping_address', 'NULL')[:50] if result['shipment'].get('shipping_address') else 'NULL'}")
    return result


class ShipmentAddressPayload(BaseModel):
    invoice_id: str
    shipping_address: str


@router.post('/invoice/shipment/address')
def update_shipping_address(payload: ShipmentAddressPayload, request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Update shipping address for an invoice"""
    if not _role_can_invoice(principal.role or ''):
        raise HTTPException(status_code=403, detail='Not permitted to update shipping address')
    org = _collect_org(db, principal, request)
    
    import json as _json
    # Get the latest shipment data for this invoice
    shipment_events = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org.org_id,
        models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    existing_shipment = None
    for se in shipment_events:
        try:
            se_data = _json.loads(se.payload or '{}')
            if se_data.get('invoice_id') == payload.invoice_id:
                existing_shipment = se_data
                break
        except Exception:
            pass
    
    if not existing_shipment:
        raise HTTPException(status_code=404, detail='No shipment assigned to this invoice')
    
    # Create updated shipment event with address
    ev = models.SyncLog(
        org_id=org.org_id,
        user_id=principal.user_id,
        type='invoice_shipment_updated',
        payload=_json.dumps({
            'invoice_id': payload.invoice_id,
            'provider_id': existing_shipment.get('provider_id'),
            'provider_name': existing_shipment.get('provider_name'),
            'provider_code': existing_shipment.get('provider_code'),
            'tracking_url': existing_shipment.get('tracking_url'),
            'tracking_number': existing_shipment.get('tracking_number'),
            'status': existing_shipment.get('status', 'pending'),
            'shipping_address': payload.shipping_address,
            'updated_at': datetime.utcnow().isoformat() + 'Z',
            'updated_by': principal.user_id,
        })
    )
    db.add(ev)
    db.commit()
    
    return {
        'status': 'ok',
        'shipping_address': payload.shipping_address,
    }

