from langchain_aws import ChatBedrock
from botocore.config import Config

def get_model_from_config(processing_config: dict) -> ChatBedrock:
    model_config = processing_config.get('model_config', {}).copy()
    model = model_config.pop('model')
    
    boto_config = Config(
        **model_config.pop('boto_config')
    )

    llm_model = ChatBedrock(
        model=model,
        config=boto_config,
        **model_config
    )
    return llm_model