"""Stripe integration for subscription management."""
import json
import os
import stripe
import boto3
from dotenv import load_dotenv

# Load local .env bundled with Lambda code/package
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=False)

# Initialize AWS clients/resources
dynamodb = boto3.resource('dynamodb')

# Initialize Stripe secrets from environment
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
USER_QUOTA_TABLE_NAME = os.environ.get('USER_QUOTA_TABLE_NAME', '')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

# Subscription plans: price_id -> monthly upload limit
# PLANS = {
#     os.environ.get('STRIPE_GOLD_PRICE_ID', ''): 50,      # Gold: 50 uploads/month
#     os.environ.get('STRIPE_PLATINUM_PRICE_ID', ''): 200,  # Platinum: 200 uploads/month
# }


def _safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def _extract_upload_limit_from_price_or_product(price_obj):
    """Extract plan upload limit from Price/Product metadata.

    Prefer Price.metadata (plan/interval specific), fallback to Product.metadata.
    """
    if not price_obj:
        return 0

    price_metadata = getattr(price_obj, 'metadata', None) or price_obj.get('metadata', {})
    upload_limit = None
    if isinstance(price_metadata, dict):
        upload_limit = price_metadata.get('upload_limit') or price_metadata.get('uploads')

    if upload_limit is None:
        product_obj = getattr(price_obj, 'product', None) or price_obj.get('product')
        product_metadata = getattr(product_obj, 'metadata', None) if product_obj else None
        if product_metadata is None and isinstance(product_obj, dict):
            product_metadata = product_obj.get('metadata')

        if isinstance(product_metadata, dict):
            upload_limit = product_metadata.get('upload_limit') or product_metadata.get('uploads')

    return _safe_int(upload_limit, default=0)


def _extract_product_id_from_price(price_obj):
    if not price_obj:
        return None
    product_obj = getattr(price_obj, 'product', None) or price_obj.get('product')
    if isinstance(product_obj, str):
        return product_obj
    if isinstance(product_obj, dict):
        return product_obj.get('id')
    return getattr(product_obj, 'id', None)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
}


def get_plans_handler(event, context):
    """List active subscription plans (products and prices)."""
    try:
        if not stripe.api_key:
            return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": "Stripe not configured"})}

        # List active products
        products = stripe.Product.list(active=True)
        
        # List active prices
        prices = stripe.Price.list(active=True, limit=100)

        plans = []
        for product in products.data:
            # Find price for this product
            # price.product can be an ID or object depending on expansion. Here it is ID by default.
            product_prices = [p for p in prices.data if p.product == product.id]
            
            if not product_prices:
                continue

            # Use the first price found
            price = product_prices[0]
            
            # Format price
            amount = (price.unit_amount / 100) if price.unit_amount else 0
            currency = price.currency.upper()
            interval = price.recurring.interval if price.recurring else 'one-time'
            
            # Extract features from Stripe Product "Marketing features" first.
            features = []
            marketing_features = getattr(product, 'marketing_features', None) or product.get('marketing_features')
            if isinstance(marketing_features, list) and marketing_features:
                features = [mf.get('name') for mf in marketing_features if isinstance(mf, dict) and mf.get('name')]
            elif product.metadata and 'features' in product.metadata:
                features = [f.strip() for f in product.metadata['features'].split(',') if f.strip()]
            elif product.description:
                features = [product.description]

            # Upload limit displayed on the plan card.
            # Prefer the same metadata key used in webhook handling: upload_limit (Price.metadata first, then Product.metadata).
            uploads = _extract_upload_limit_from_price_or_product(price)
            if not uploads and product.metadata:
                uploads = _safe_int(product.metadata.get('upload_limit') or product.metadata.get('uploads'), default=0)

            plans.append({
                "name": product.name,
                "price": f"${amount:.2f}/{interval}",
                "priceId": price.id,
                "features": features,
                "uploads": uploads
            })
        
        # Sort plans by price amount
        plans.sort(key=lambda x: float(x['price'].split('/')[0].replace('$', '')))

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"plans": plans})
        }
    except Exception as e:
        print(e)
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}


def create_checkout_handler(event, context):
    """Create Stripe Checkout Session for subscription."""
    try:
        if not stripe.api_key:
            return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": "Stripe not configured"})}
        # Get user from Cognito token
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        user_email = claims.get('email', '')
        
        if not user_id:
            return {"statusCode": 401, "headers": CORS_HEADERS, "body": json.dumps({"error": "Unauthorized"})}

        # Get price_id from request body
        body = json.loads(event.get('body', '{}'))
        price_id = body.get('priceId')
        
        if not price_id:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "Missing priceId"})}

        # Create Checkout Session
        session = stripe.checkout.Session.create(
            mode='subscription',
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=body.get('successUrl', 'http://localhost:3000') + '?success=true',
            cancel_url=body.get('cancelUrl', 'http://localhost:3000') + '?canceled=true',
            customer_email=user_email,
            expand=["line_items", "line_items.data.price.product"],
            metadata={'userId': user_id},  # Store userId to link subscription to user
        )

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"url": session.url})
        }
    except Exception as e:
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}


def webhook_handler(event, context):
    """Handle Stripe webhook events."""
    print(json.dumps(event))
    try:
        if not stripe.api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "Stripe not configured"})}
        if not WEBHOOK_SECRET:
            return {"statusCode": 500, "body": json.dumps({"error": "Stripe webhook secret not configured"})}
        payload = event.get('body', '')
        sig_header = event.get('headers', {}).get('Stripe-Signature', '')

        # Verify webhook signature (IMPORTANT for security!)
        try:
            stripe_event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid signature"})}

        event_type = stripe_event['type']
        data = stripe_event['data']['object']

        # Handle subscription events
        if event_type == 'checkout.session.completed':
            # New subscription created
            handle_checkout_completed(data)
        
        elif event_type == 'invoice.paid':
            # Monthly renewal - reset quota
            handle_invoice_paid(data)
        
        elif event_type == 'customer.subscription.deleted':
            # Subscription canceled - revert to free tier
            handle_subscription_deleted(data)

        return {"statusCode": 200, "body": json.dumps({"received": True})}
    except Exception as e:
        print(f"Webhook error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def handle_checkout_completed(session):
    """Handle successful checkout - update user's upload limit."""
    user_id = session.get('metadata', {}).get('userId')
    if not user_id:
        print("No userId in session metadata")
        return

    # For subscription mode Checkout, the completed Session includes subscription id.
    # Webhook payloads don't include expanded objects reliably, so retrieve the Subscription
    # and expand items.data.price.product to get product + metadata.
    subscription_id = session.get('subscription')
    if not subscription_id:
        print("No subscription id on checkout session")
        return

    subscription = stripe.Subscription.retrieve(
        subscription_id,
        expand=["items.data.price.product"],
    )

    items = (subscription.get('items') or {}).get('data') or []
    if not items:
        print(f"No subscription items on {subscription_id}")
        return

    price = items[0].get('price')
    price_id = (price or {}).get('id') if isinstance(price, dict) else getattr(price, 'id', None)
    product_id = _extract_product_id_from_price(price)
    new_limit = _extract_upload_limit_from_price_or_product(price) or 10

    print(
        json.dumps(
            {
                "subscriptionId": subscription_id,
                "priceId": price_id,
                "productId": product_id,
                "uploadLimit": new_limit,
            }
        )
    )

    # Update user's quota in DynamoDB
    update_user_quota(user_id, new_limit, subscription_id)


def handle_invoice_paid(invoice):
    """Handle monthly invoice - reset upload count for the new billing period."""
    subscription_id = invoice.get('subscription')
    if not subscription_id:
        return

    subscription = stripe.Subscription.retrieve(
        subscription_id,
        expand=["items.data.price.product"],
    )
    items = (subscription.get('items') or {}).get('data') or []
    price = items[0].get('price') if items else None
    new_limit = _extract_upload_limit_from_price_or_product(price) or 10

    # Find user by subscription_id and reset their count
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    
    # Scan for user with this subscription (in production, use a GSI)
    response = table.scan(
        FilterExpression='subscriptionId = :sid',
        ExpressionAttributeValues={':sid': subscription_id}
    )
    
    for item in response.get('Items', []):
        table.update_item(
            Key={'userId': item['userId']},
            UpdateExpression='SET uploadCount = :zero, uploadLimit = :limit',
            ExpressionAttributeValues={':zero': 0, ':limit': new_limit}
        )


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation - revert to free tier."""
    subscription_id = subscription.get('id')
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    
    response = table.scan(
        FilterExpression='subscriptionId = :sid',
        ExpressionAttributeValues={':sid': subscription_id}
    )
    
    for item in response.get('Items', []):
        table.update_item(
            Key={'userId': item['userId']},
            UpdateExpression='SET uploadLimit = :limit, subscriptionId = :null',
            ExpressionAttributeValues={':limit': 10, ':null': None}
        )


def update_user_quota(user_id, new_limit, subscription_id):
    """Update user's quota in DynamoDB."""
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    table.update_item(
        Key={'userId': user_id},
        UpdateExpression='SET uploadLimit = :limit, uploadCount = :zero, subscriptionId = :sid',
        ExpressionAttributeValues={
            ':limit': new_limit,
            ':zero': 0,
            ':sid': subscription_id
        }
    )
