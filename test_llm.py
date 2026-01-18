
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("OPENROUTER_API_KEY")
base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
model = "anthropic/claude-3.5-sonnet"

print(f"Testing OpenRouter with:")
print(f"Base URL: {base_url}")
print(f"Model: {model}")
print(f"API Key present: {bool(api_key)}")

client = OpenAI(
    base_url=base_url,
    api_key=api_key,
)

try:
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Hello"}],
    )
    print("Success!")
    print(response.choices[0].message.content)
except Exception as e:
    print(f"Error: {e}")
