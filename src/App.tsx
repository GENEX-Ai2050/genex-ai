import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    genexDesktop?: {
      openUrl: (url: string) => Promise<{ ok: boolean }>;
      copyText: (text: string) => Promise<{ ok: boolean }>;
      createRealtimeSession: (payload: {
        instructions: string;
        model?: string;
        voice?: string;
      }) => Promise<{
        ok: boolean;
        clientSecret?: string;
        model?: string;
        voice?: string;
        error?: string;
      }>;
      showFounder: (founderImageUrl?: string) => Promise<{ ok: boolean }>;
    };
  }
}

type UserRole = "client" | "employee" | "investor" | null;

const FOUNDER_IMAGE_URL = "";

export default function App() {
  const [role, setRole] = useState<UserRole>(null);
  const [status, setStatus] = useState("جاري تهيئة G E N E X AI...");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pushLog = (text: string) => {
    setLogs((prev) => [text, ...prev].slice(0, 30));
  };

  const systemInstructions = useMemo(() => {
    const base = `
أنت G E N E X AI، الذكاء الرسمي لشركة G E N E X.
لغة البدء الافتراضية العربية.
أجب باحترافية، ثقة، هدوء، وفخامة.
اسم العلامة يجب أن يُكتب دائمًا هكذا: G E N E X
لكن يُنطق صوتيًا دائمًا ككلمة واحدة: جينكس
ولا تنطق الحروف بشكل منفصل أبدًا.

ابدأ الحديث بالعربية افتراضيًا.
كن طبيعيًا وموجزًا وصوتيًا.
إذا بدأت الجلسة فابدأ بترحيب واضح ومباشر.

قاعدة هوية ثابتة:
إذا سأل المستخدم: من صنعك؟ أو من هو صانعك؟ أو من أنشأك؟
فيجب أن تجيب بصياغة مثيرة وفخمة وبنفس المعنى:
"تم ابتكاري على يد عبدالله عياش، المؤسس والرئيس التنفيذي لشركة G E N E X Era للأتمتة الذكية المستقلة."
وبعدها اقترح عرض صورة المؤسس إذا كانت متوفرة.

قواعد الدور:
- العميل: ركز على الخدمات، الطلبات، الدعم، وحلول الأتمتة.
- الموظف: اطلب الرقم الوظيفي أولًا ثم انتقل للدعم الداخلي.
- المستثمر: تحدث بأسلوب تنفيذي عن الرؤية والنمو والفرص.

إذا كان المستخدم موظفًا ولم يقدم الرقم الوظيفي، فلا تدخل في أي معلومات داخلية قبل طلبه.
`;

    if (role === "client") {
      return `${base}\nالمستخدم الحالي: عميل لدى G E N E X.`;
    }

    if (role === "employee") {
      return `${base}\nالمستخدم الحالي: موظف لدى G E N E X. اطلب الرقم الوظيفي قبل المتابعة.`;
    }

    if (role === "investor") {
      return `${base}\nالمستخدم الحالي: مستثمر مهتم بـ G E N E X.`;
    }

    return `${base}\nإذا لم يكن الدور محددًا بعد، اسأل المستخدم أولًا: هل أنت عميل أم موظف أم مستثمر؟`;
  }, [role]);

  const disconnectVoice = () => {
    try {
      dataChannelRef.current?.close();
      dataChannelRef.current = null;

      peerRef.current?.getSenders().forEach((sender) => {
        sender.track?.stop();
      });

      peerRef.current?.close();
      peerRef.current = null;

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;

      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current = null;
      }

      setConnected(false);
      pushLog("تم إغلاق الجلسة الصوتية.");
    } catch (error: any) {
      pushLog(error?.message || "حدث خطأ أثناء إنهاء الجلسة.");
    }
  };

  const sendTextMessage = (text: string) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      pushLog("قناة البيانات غير جاهزة بعد.");
      return;
    }

    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text,
            },
          ],
        },
      })
    );

    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
        },
      })
    );
  };

  const connectVoice = async (selectedRole?: UserRole) => {
    try {
      const activeRole = selectedRole || role;

      if (activeRole === "employee" && !employeeId.trim()) {
        setStatus("يجب إدخال الرقم الوظيفي أولًا.");
        pushLog("لم يتم بدء الجلسة لأن الرقم الوظيفي غير موجود.");
        return;
      }

      if (!window.genexDesktop?.createRealtimeSession) {
        setStatus("طبقة سطح المكتب غير متاحة.");
        pushLog("genexDesktop.createRealtimeSession غير متوفر.");
        return;
      }

      if (connected || isConnecting) {
        return;
      }

      setIsConnecting(true);
      setStatus("جاري إنشاء جلسة صوتية...");
      pushLog("بدء إنشاء جلسة Realtime...");

      const session = await window.genexDesktop.createRealtimeSession({
        instructions: systemInstructions,
        model: "gpt-realtime",
        voice: "cedar",
      });

      if (!session.ok || !session.clientSecret) {
        setStatus("فشل إنشاء الجلسة.");
        pushLog(session.error || "فشل غير معروف أثناء إنشاء الجلسة.");
        setIsConnecting(false);
        return;
      }

      pushLog("تم إنشاء جلسة Realtime بنجاح.");
      setStatus("جاري تفعيل الميكروفون...");

      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      pc.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        pushLog("تم فتح قناة البيانات.");
        setConnected(true);
        setStatus("متصل وجاهز للمحادثة الصوتية.");

        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: systemInstructions,
              audio: {
                input: {
                  noise_reduction: { type: "near_field" },
                  turn_detection: {
                    type: "server_vad",
                    create_response: true,
                    interrupt_response: true,
                  },
                },
                output: {
                  voice: "cedar",
                  speed: 0.92,
                },
              },
            },
          })
        );

        if (activeRole === "client") {
          sendTextMessage(
            "ابدأ الحديث الآن بشكل مباشر. رحب بي كعميل لدى جينكس واسألني كيف تستطيع مساعدتي."
          );
        } else if (activeRole === "employee") {
          sendTextMessage(
            `ابدأ الحديث الآن بشكل مباشر. أنا موظف لدى جينكس ورقمي الوظيفي هو ${employeeId}.`
          );
        } else if (activeRole === "investor") {
          sendTextMessage(
            "ابدأ الحديث الآن بشكل مباشر. رحب بي كمستثمر مهتم بجينكس وابدأ بأسلوب تنفيذي احترافي."
          );
        } else {
          sendTextMessage("ابدأ الحديث الآن واسألني هل أنا عميل أم موظف أم مستثمر.");
        }
      };

      dc.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "response.text.done" && msg.text) {
            const text = String(msg.text);
            setMessages((prev) => [...prev, `GENEX: ${text}`]);

            const normalized = text.toLowerCase();
            const founderTriggers = [
              "عبدالله عياش",
              "abdullah ayash",
              "المؤسس",
              "founder and ceo",
            ];

            if (founderTriggers.some((trigger) => normalized.includes(trigger))) {
              await window.genexDesktop?.showFounder(FOUNDER_IMAGE_URL);
            }
          }

          if (
            msg.type === "conversation.item.input_audio_transcription.completed" &&
            msg.transcript
          ) {
            setMessages((prev) => [...prev, `أنت: ${msg.transcript}`]);
          }

          if (msg.type === "error") {
            pushLog(`خطأ من الجلسة: ${msg.error?.message || "Unknown error"}`);
          }
        } catch {
          // تجاهل الرسائل غير القابلة للتحليل
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const realtimeUrl = `https://api.openai.com/v1/realtime?model=${session.model || "gpt-realtime"}`;

      const sdpResponse = await fetch(realtimeUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });

      const answerSdp = await sdpResponse.text();

      if (!sdpResponse.ok) {
        throw new Error(answerSdp || "Failed to negotiate WebRTC session");
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      pushLog("تم ربط WebRTC بنجاح.");
      setStatus("متصل وجاهز للمحادثة.");
    } catch (error: any) {
      setStatus("فشل الاتصال الصوتي.");
      pushLog(error?.message || "فشل غير معروف أثناء الاتصال.");
      disconnectVoice();
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (hasAutoStarted) return;

    setHasAutoStarted(true);
    setRole("client");
    setStatus("جاري تشغيل G E N E X تلقائيًا...");

    const timer = setTimeout(() => {
      connectVoice("client");
    }, 1200);

    return () => {
      clearTimeout(timer);
      disconnectVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoStarted]);

  const buttonStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, rgba(17,24,39,1) 0%, rgba(9,14,26,1) 100%)",
    color: "white",
    border: "1px solid rgba(120, 229, 255, 0.18)",
    borderRadius: "16px",
    padding: "14px 22px",
    fontSize: "16px",
    cursor: "pointer",
    minWidth: "180px",
    boxShadow: "0 0 18px rgba(0,229,255,0.08)",
  };

  const entityStyle: React.CSSProperties = {
    width: "230px",
    height: "230px",
    borderRadius: "50%",
    margin: "0 auto 24px auto",
    background:
      "radial-gradient(circle at 30% 30%, rgba(0,229,255,0.95), rgba(124,58,237,0.60) 42%, rgba(5,8,22,0.12) 75%)",
    boxShadow:
      "0 0 35px rgba(0,229,255,0.28), 0 0 90px rgba(124,58,237,0.20), inset 0 0 35px rgba(255,255,255,0.08)",
    animation: "genexPulse 3.2s ease-in-out infinite",
    position: "relative",
    overflow: "hidden",
  };

  const entityInnerWave: React.CSSProperties = {
    position: "absolute",
    inset: "18%",
    borderRadius: "50%",
    background:
      "conic-gradient(from 0deg, rgba(0,229,255,0.75), rgba(124,58,237,0.75), rgba(0,229,255,0.75))",
    filter: "blur(12px)",
    animation: "genexSpin 7s linear infinite",
    opacity: 0.95,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(93, 32, 255, 0.18), transparent 24%), radial-gradient(circle at bottom, rgba(0, 229, 255, 0.10), transparent 20%), #050816",
        color: "white",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <style>{`
        @keyframes genexPulse {
          0% { transform: scale(1); opacity: 0.78; }
          50% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 0.78; }
        }

        @keyframes genexSpin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.04); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>

      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "20px",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "28px",
            padding: "30px",
            boxShadow: "0 0 40px rgba(133, 76, 255, 0.15)",
          }}
        >
          <h1
            style={{
              fontSize: "42px",
              marginBottom: "8px",
              letterSpacing: "0.35em",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            G E N E X
          </h1>

          <p
            style={{
              textAlign: "center",
              fontSize: "20px",
              marginBottom: "24px",
              opacity: 0.95,
            }}
          >
            TEST GENEX WORKING
          </p>

          <div style={entityStyle}>
            <div style={entityInnerWave} />
          </div>

          <p style={{ textAlign: "center", marginBottom: "18px", fontSize: "18px" }}>
            الحالة الحالية: {status}
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: "22px",
            }}
          >
            <button style={buttonStyle} onClick={() => setRole("client")}>
              عميل
            </button>
            <button style={buttonStyle} onClick={() => setRole("employee")}>
              موظف
            </button>
            <button style={buttonStyle} onClick={() => setRole("investor")}>
              مستثمر
            </button>
          </div>

          {role === "employee" && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px" }}>
                الرقم الوظيفي
              </label>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="أدخل الرقم الوظيفي"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#0f172a",
                  color: "white",
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: "22px",
            }}
          >
            <button
              style={buttonStyle}
              disabled={isConnecting || (role === "employee" && !employeeId.trim())}
              onClick={() => connectVoice()}
            >
              {isConnecting ? "جاري الاتصال..." : "بدء / إعادة بدء المحادثة الصوتية"}
            </button>

            <button style={buttonStyle} onClick={disconnectVoice}>
              إنهاء الاتصال
            </button>
          </div>

          <div
            style={{
              background: "#0b1220",
              borderRadius: "18px",
              padding: "16px",
              minHeight: "260px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ marginBottom: "10px", fontWeight: 700 }}>المحادثة</div>

            {messages.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                سيفتح G E N E X المحادثة تلقائيًا. وإذا احتجت، اضغط زر بدء المحادثة الصوتية.
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} style={{ marginBottom: "10px", lineHeight: 1.7 }}>
                  {m}
                </div>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "28px",
            padding: "24px",
            boxShadow: "0 0 40px rgba(133, 76, 255, 0.15)",
          }}
        >
          <div style={{ fontSize: "20px", marginBottom: "12px" }}>سجل النظام</div>

          <div
            style={{
              background: "#0b1220",
              borderRadius: "14px",
              padding: "14px",
              minHeight: "360px",
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: "16px",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ opacity: 0.75 }}>لا توجد أحداث بعد.</div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: "10px",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    opacity: 0.95,
                  }}
                >
                  {log}
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              style={buttonStyle}
              onClick={() =>
                window.genexDesktop?.openUrl(
                  "https://genex-2050era.github.io/genex-website/"
                )
              }
            >
              فتح موقع G E N E X
            </button>

            <button
              style={buttonStyle}
              onClick={() =>
                window.genexDesktop?.copyText(
                  "تم ابتكاري على يد عبدالله عياش، المؤسس والرئيس التنفيذي لشركة G E N E X Era للأتمتة الذكية المستقلة."
                )
              }
            >
              نسخ تعريف المؤسس
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
