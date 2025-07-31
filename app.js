function getElement(id) {
  return document.getElementById(id);
}

const stepOne = getElement("page1");
const stepTwo = getElement("page2");
const stepThree = getElement("page3");

const apiKeyInput = getElement("apiKey");
const toolSelect = getElement("tool");
const modelInput = getElement("model");
const frequencyInput = getElement("freq");

const promptTextArea = getElement("promptArea");
const logsContainer = getElement("logs");
const videoContainer = getElement("innerVideoBox");

const nextButton = getElement("nextBtn");
const backButton = getElement("backBtn");
const startButton = getElement("startBtn");
const stopButton = getElement("stopBtn");
const restartButton = getElement("restartBtn");
const exportButton = getElement("exportBtn");

const chatInput = getElement("chatInput");
const sendChatButton = getElement("sendChatBtn");

const WEBSOCKET_URL = "ws://localhost:9083";
let websocket;
let screenStream;
let frameSendInterval;
let isLoggingEnabled = true;
const chatLog = [];

function switchPage(hide, show) {
  hide.classList.add("hidden");
  show.classList.remove("hidden");
}

nextButton.onclick = function () {
  promptTextArea.value = PROMPTS[toolSelect.value];
  switchPage(stepOne, stepTwo);
};

backButton.onclick = function () {
  switchPage(stepTwo, stepOne);
};

startButton.onclick = startMonitoring;

async function startMonitoring() {
  switchPage(stepTwo, stepThree);

  screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

  const videoElement = document.createElement("video");
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.srcObject = screenStream;

  videoContainer.innerHTML = "";
  videoContainer.appendChild(videoElement);

  websocket = new WebSocket(WEBSOCKET_URL);

  websocket.onopen = function () {
    const setupData = {
      setup: {
        api_key: apiKeyInput.value.trim(),
        tool: toolSelect.value,
        model: modelInput.value,
        freq: Number(frequencyInput.value) || 5,
        prompt: promptTextArea.value.trim()
      }
    };
    websocket.send(JSON.stringify(setupData));
    beginFrameSending();
  };

  websocket.onmessage = function (event) {
    const message = JSON.parse(event.data);

    if (message.text) {
      addLog("Assistant: " + message.text);
    }

    if (message.summary_text) {
      const blob = new Blob([message.summary_text], { type: "text/plain" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "gemini-monitor-summary.txt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    }
  };

  websocket.onclose = function () {
    addLog("Connection Closed");
  };

  websocket.onerror = function (e) {
    addLog(" websocket error " + e.message);
  };

  stopButton.disabled = false;
  restartButton.disabled = false;
  exportButton.disabled = false;
}

function beginFrameSending() {
  const intervalSeconds = Number(frequencyInput.value) || 5;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  const videoTrack = screenStream.getVideoTracks()[0];
  const videoSettings = videoTrack.getSettings();

  canvas.width = videoSettings.width || 1280;
  canvas.height = videoSettings.height || 720;

  frameSendInterval = setInterval(() => {
    const video = videoContainer.querySelector("video");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg").split(",")[1];

    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{
            mime_type: "image/jpeg",
            data: imageData
          }]
        }
      }));
    }
  }, intervalSeconds * 1000);
}

function addLog(text) {
  if (!isLoggingEnabled) return;

  chatLog.push(text);

  const logEntry = document.createElement("div");
  logEntry.textContent = text;
  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

sendChatButton.onclick = function () {
  const message = chatInput.value.trim();
  if (!message || !websocket || websocket.readyState !== WebSocket.OPEN) return;

  addLog("User: " + message);
  websocket.send(JSON.stringify({ user_text: message }));
  chatInput.value = "";
};

stopButton.onclick = function () {
  isLoggingEnabled = false;
  if (frameSendInterval) clearInterval(frameSendInterval);
  if (screenStream) screenStream.getTracks().forEach(track => track.stop());
  if (websocket && websocket.readyState === WebSocket.OPEN) websocket.close();
  stopButton.disabled = true;
};

restartButton.onclick = function () {
  if (websocket && websocket.readyState === WebSocket.OPEN) websocket.close();
  if (frameSendInterval) clearInterval(frameSendInterval);
  if (screenStream) screenStream.getTracks().forEach(track => track.stop());

  chatLog.length = 0;
  logsContainer.innerHTML = "";

  const placeholder = document.createElement("div");
  placeholder.className = "inner";
  videoContainer.innerHTML = "";
  videoContainer.appendChild(placeholder);

  isLoggingEnabled = true;
  stopButton.disabled = false;

  switchPage(stepThree, stepOne);
};

exportButton.onclick = function () {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  const summaryText = chatLog.join("\n");
  websocket.send(JSON.stringify({ llm_summary: summaryText }));
};
