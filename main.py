import asyncio
import json
import websockets
from base64 import b64decode
from websockets.legacy.server import WebSocketServerProtocol
from google.generativeai import configure, GenerativeModel

# Keep track of all responses to avoid repetition
seen_responses = set()

async def handler(socket: WebSocketServerProtocol):
    cfg = await socket.recv()
    setup = json.loads(cfg)["setup"]
    configure(api_key=setup["api_key"])
    model = GenerativeModel(setup["model"])
    session = model.start_chat(history=[{"role": "user", "parts": [setup["prompt"]]}])

    async for msg in socket:
        data = json.loads(msg)
        for element in data.get("realtime_input", {}).get("media_chunks", []):
            if element["mime_type"] == "image/jpeg":
                decoded = b64decode(element["data"])
                parts = [{"inline_data": {"mime_type": "image/jpeg", "data": decoded}}]
                response = session.send_message(parts)
                new_text = response.text.strip()

                if new_text and new_text not in seen_responses:
                    seen_responses.add(new_text)
                    print("[MODEL]:", new_text)
                    await socket.send(json.dumps({"text": new_text}))
                else:
                    print("[MODEL]: Duplicate or empty response skipped")

        user_text = data.get("user_text")
        if user_text:
            print("[USER]:", user_text)
            response = session.send_message(user_text)
            new_text = response.text.strip()

            if new_text:
                print("[MODEL]:", new_text)
                await socket.send(json.dumps({"text": new_text}))

        llm_summary = data.get("llm_summary")
        if llm_summary:
            print("[SUMMARY REQUESTED]")
            response = session.send_message(f"Summarize this monitoring session:\n{llm_summary}")
            summary_text = response.text.strip()

            if summary_text:
                print("[SUMMARY DONE]:", summary_text)
                await socket.send(json.dumps({"summary_text": summary_text}))

async def main():
    async with websockets.serve(handler, "localhost", 9083):
        print("WebSocket on ws://localhost:9083")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
