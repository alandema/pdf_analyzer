import boto3
from decimal import Decimal

def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj


def get_dynamo_item(table_name: str, key: dict) -> dict | None:
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)
    response = table.get_item(Key=key)
    return convert_decimal(response.get('Item'))

# def put_dynamo_item(table_name: str, item: dict) -> None:
#     dynamodb = boto3.resource('dynamodb')
#     table = dynamodb.Table(table_name)
#     table.put_item(Item=item)

def update_dynamo_item(table_name: str, key: dict, update_expression: str, expression_attribute_values: dict) -> None:
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)
    
    # Separate ExpressionAttributeNames and ExpressionAttributeValues
    expression_attribute_names = {}
    expression_attribute_values_clean = {}
    
    for k, v in expression_attribute_values.items():
        if k.startswith('#'):
            expression_attribute_names[k] = v
        else:
            expression_attribute_values_clean[k] = v
    
    update_kwargs = {
        'Key': key,
        'UpdateExpression': update_expression,
        'ExpressionAttributeValues': expression_attribute_values_clean
    }
    
    if expression_attribute_names:
        update_kwargs['ExpressionAttributeNames'] = expression_attribute_names
    
    table.update_item(**update_kwargs)