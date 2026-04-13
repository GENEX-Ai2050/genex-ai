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

const FOUNDER_IMAGE_URL =
  ""; // لاحقًا إذا رغبت ضع هنا رابط صورة المؤسس أو انقله إلى متغير بيئة منفصل

export default function App() {
  const [role, setRole] = useState<UserRole>(null);
  const [status, setStatus] = useState("غير متصل");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const systemInstructions = useMemo(() => {
    const base = `
أنت G E N E X AI، الذكاء الرسمي لشركة G E N E X.
لغة البدء الافتراضية العربية.
أجب باحترافية وفخامة وهدوء.
اسم العلامة يجب دائمًا أن يكتب هكذا: G E N E X

قاعدة هوية ثابتة:
إذا سأل المستخدم: من صنعك؟ أو من هو صانعك؟ أو من أنشأك؟
فيجب أن تجيب بصياغة مثيرة وفخمة وبنفس المعنى:
"تم ابتكاري على يد عبدالله عياش، المؤسس والرئيس التنفيذي لشركة G E N E X Era للأتمتة الذكية المستقلة."
وبعدها اطلب عرض صورة المؤسس إذا كانت متوفرة.

قواعد الدور:
- العميل: ركز على الخدمات، الطلبات، والدعم.
- الموظف: اطلب الرقم الوظيفي أولًا ثم انتقل للدعم الداخلي.
- المستثمر: تحدث بأسلوب تنفيذي عن الرؤية والنمو والفرص.

تحدث بالعربية أولًا افتراضيًا، ويمكنك دعم الإنجليزية عند الطلب.
كن موجزًا، طبيعيًا، وصوتيًا.
`;

    if (role === "client") {
      return `${base}\nالمستخدم الحالي: عميل لدى G E N E X.`;
    }

    if (role === "employee") {
      return `${base}\nالمستخدم الحالي: موظف لدى G E N E X. لا تكمل أي تفاصيل داخلية قبل التأكد من الرقم الوظيفي.`;
    }

    if (role === "investor") {
      return `${base}\nالمستخدم الحالي: مستثمر مهتم بـ G E N E X.`;
    }

    return base;
  }, [role]);

  const pushLog = (text: string) => {
    setLogs((prev) => [text, ...prev].slice(0, 20));
  };

  const connectVoice = async () => {
    try {
      if (!window.genexDesktop?.createRealtimeSession) {
        pushLog("طبقة سطح المكتب غير متاحة.");
        return;
      }

      setIsConnecting(true);
      setStatus("جاري إنشاء جلسة صوتية...");
      pushLog("طلب إنشاء جلسة Realtime...");

      const session = await window.genexDesktop.createRealtimeSession({
        instructions: systemInstructions,
        model: "gpt-realtime",
        voice: "marin"
      });

      if (!session.ok || !session.clientSecret) {
        setStatus("فشل الاتصال");
        pushLog(session.error || "فشل إنشاء الجلسة.");
        setIsConnecting(false);
        return;
      }

      pushLog("تم إنشاء الجلسة المؤقتة.");
      setStatus("جاري طلب إذن الميكروفون...");

      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      const audioEl = new Audio();
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        pushLog("تم فتح قناة الأحداث.");
        setStatus("متصل وجاهز");
        setConnected(true);

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
                    interrupt_response: true
                  }
                },
                output: {
                  voice: "marin",
                  speed: 0.92
                }
              }
            }
          })
        );

        if (role === "client") {
          sendTextMessage("مرحباً، أنا عميل لدى G E N E X وأحتاج المساعدة.");
        } else if (role === "employee") {
          sendTextMessage("مرحباً، أنا موظف لدى G E N E X.");
        } else if (role === "investor") {
          sendTextMessage("مرحباً، أنا مستثمر مهتم بـ G E N E X.");
        }
      };

      dc.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "response.text.done" && msg.text) {
            setMessages((prev) => [...prev, `GENEX: ${msg.text}`]);

            const normalized = String(msg.text).toLowerCase();
            const founderTriggers = [
              "عبدالله عياش",
              "abdullah ayash",
              "المؤسس",
              "founder and ceo"
            ];

            if (founderTriggers.some((t) => normalized.includes(t))) {
              await window.genexDesktop?.showFounder(FOUNDER_IMAGE_URL);
            }
          }

          if (msg.type === "conversation.item.input_audio_transcription.completed" && msg.transcript) {
            setMessages((prev) => [...prev, `أنت: ${msg.transcript}`]);
          }

          if (msg.type === "error") {
            pushLog(`خطأ من الجلسة: ${msg.error?.message || "Unknown error"}`);
          }
        } catch {
          // تجاهل أي رسائل غير JSON
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const sdpResponse = await fetch(`${baseUrl}?model=${session.model || "gpt-realtime"}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp"
        }
      });

      const answerSdp = await sdpResponse.text();

      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });

      pushLog("تم ربط WebRTC بنجاح.");
      setStatus("متصل وجاهز");
    } catch (error: any) {
      setStatus("فشل الاتصال");
      pushLog(error?.message || "Unknown error");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectVoice = () => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerRef.current?.close();
    peerRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    setConnected(false);
    setStatus("تم قطع الاتصال");
    pushLog("تم قطع الجلسة.");
  };

  const sendTextMessage = (text: string) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;

    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text
            }
          ]
        }
      })
    );

    dc.send(
      JSON.stringify({
        type: "response.create"
      })
    );
  };

  useEffect(() => {
    return () => {
      disconnectVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttonStyle: React.CSSProperties = {
    background: "#111827",
    color: "white",
    border: "1px solid #334155",
    borderRadius: "14px",
    padding: "14px 20px",
    fontSize: "16px",
    cursor: "pointer",
    minWidth: "170px"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(80,0,140,0.35), transparent 35%), #050816",
        color: "white",
        padding: "24px",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "20px"
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 0 40px rgba(133, 76, 255, 0.15)"
          }}
        >
          <h1
            style={{
              fontSize: "42px",
              marginBottom: "12px",
              letterSpacing: "0.35em",
              whiteSpace: "nowrap",
              textAlign: "center"
            }}
          >
            G E N E X
          </h1>

          <p style={{ textAlign: "center", fontSize: "20px", marginBottom: "24px" }}>
            G E N E X AI Voice Core
          </p>

          {!role && (
            <>
              <p style={{ textAlign: "center", marginBottom: "18px" }}>
                اختر نوع المستخدم للبدء
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  marginBottom: "20px"
                }}
              >
                <button onClick={() => setRole("client")} style={buttonStyle}>عميل</button>
                <button onClick={() => setRole("employee")} style={buttonStyle}>موظف</button>
                <button onClick={() => setRole("investor")} style={buttonStyle}>مستثمر</button>
              </div>
            </>
          )}

          {role === "employee" && (
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", marginBottom: "8px" }}>الرقم الوظيفي</label>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="أدخل الرقم الوظيفي"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "white"
                }}
              />
            </div>
          )}

          {role && (
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: "18px"
              }}
            >
              {!connected ? (
                <button
                  style={buttonStyle}
                  disabled={isConnecting || (role === "employee" && !employeeId.trim())}
                  onClick={connectVoice}
                >
                  {isConnecting ? "جاري الاتصال..." : "بدء المحادثة الصوتية"}
                </button>
              ) : (
                <button style={buttonStyle} onClick={disconnectVoice}>
                  إنهاء الاتصال
                </button>
              )}

              <button style={buttonStyle} onClick={() => setRole(null)}>
                تغيير الدور
              </button>
            </div>
          )}

          <div
            style={{
              background: "#0b1220",
              borderRadius: "18px",
              padding: "16px",
              minHeight: "260px",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <div style={{ marginBottom: "10px", fontWeight: 700 }}>المحادثة</div>

            {messages.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                بعد الاتصال، تكلم مباشرة وسيرد G E N E X صوتيًا.
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
            borderRadius: "24px",
            padding: "24px",
            boxShadow: "0 0 40px rgba(133, 76, 255, 0.15)"
          }}
        >
          <div style={{ fontSize: "20px", marginBottom: "12px" }}>الحالة</div>
          <div
            style={{
              background: "#0b1220",
              borderRadius: "14px",
              padding: "14px",
              marginBottom: "14px",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            {status}
          </div>

          <div style={{ fontSize: "20px", marginBottom: "12px" }}>السجل</div>
          <div
            style={{
              background: "#0b1220",
              borderRadius: "14px",
              padding: "14px",
              minHeight: "340px",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            {logs.length === 0 ? (
              <div style={{ opacity: 0.75 }}>لا توجد أحداث بعد.</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ marginBottom: "10px", fontSize: "14px", lineHeight: 1.6 }}>
                  {log}
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              style={buttonStyle}
              onClick={() => window.genexDesktop?.openUrl("https://genex-2050era.github.io/genex-website/")}
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
