from dotenv import load_dotenv
from google import genai
import os

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "your_gemini_api_key_here")

client = genai.Client(api_key=GEMINI_API_KEY)

def send_message(input_text: str) -> str:
    interaction = client.interactions.create(
        model="gemini-3.5-flash-lite",
        input=input_text,
    )
    return interaction.output_text
