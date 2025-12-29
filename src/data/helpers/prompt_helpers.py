from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder
import base64

def get_prompt_from_config(prompt_config: dict, pdf_bytes: bytes, fileId: str) -> ChatPromptTemplate:
    system_message_template = SystemMessagePromptTemplate.from_template(prompt_config['system_message'])
    user_message_template = HumanMessagePromptTemplate.from_template(
        [
            {
                "type": "file",
                "name": fileId,
                "mimeType": "application/pdf",
                "base64": base64.b64encode(pdf_bytes).decode("utf-8")
            },
            {"type": "text", "text": prompt_config['user_message']}
        ]
    )

    prompt = ChatPromptTemplate.from_messages([
        system_message_template,
        user_message_template
    ])
    return prompt