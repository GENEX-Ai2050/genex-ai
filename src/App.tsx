import { useState } from "react";

declare global {
  interface Window {
    genexDesktop?: {
      openUrl: (url: string) => Promise<{ ok: boolean }>;
      copyText: (text: string) => Promise<{ ok: boolean }>;
    };
  }
}

export default function App() {
  const [role, setRole] = useState<string | null>(null);

  const speak = (text: string) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ar-SA";
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const handleStart = (type: string) => {
    setRole(type);

    if (type === "client") {
      speak("مرحباً بك عميل لدى G E N E X");
    }

    if (type === "employee") {
      speak("مرحباً بك موظف لدى G E N E X. الرجاء إدخال الرقم الوظيفي للمتابعة");
    }

    if (type === "investor") {
      speak("مرحباً بك مستثمر يرغب بالاستثمار في G E N E X");
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: "#111827",
    color: "white",
    border: "1px solid #334155",
    borderRadius: "14px",
    padding: "14px 20px",
    fontSize: "16px",
    cursor: "pointer",
    minWidth: "150px"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(80,0,140,0.35), transparent 35%), #050816",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          textAlign: "center",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "24px",
          padding: "32px",
          boxShadow: "0 0 40px rgba(133, 76, 255, 0.15)"
        }}
      >
        {!role && (
          <>
            <h1
              style={{
                fontSize: "42px",
                marginBottom: "12px",
                letterSpacing: "0.35em",
                whiteSpace: "nowrap"
              }}
            >
              G E N E X
            </h1>

            <p style={{ fontSize: "22px", marginBottom: "8px" }}>
              G E N E X AI
            </p>

            <p style={{ fontSize: "18px", marginBottom: "28px", opacity: 0.9 }}>
              اختر نوع المستخدم
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap"
              }}
            >
              <button onClick={() => handleStart("client")} style={buttonStyle}>
                عميل
              </button>

              <button onClick={() => handleStart("employee")} style={buttonStyle}>
                موظف
              </button>

              <button onClick={() => handleStart("investor")} style={buttonStyle}>
                مستثمر
              </button>
            </div>
          </>
        )}

        {role && (
          <>
            <h2
              style={{
                fontSize: "34px",
                marginBottom: "12px",
                letterSpacing: "0.22em",
                whiteSpace: "nowrap"
              }}
            >
              G E N E X AI
            </h2>

            <p style={{ marginBottom: "24px", fontSize: "18px" }}>
              تم تفعيل النظام بنجاح
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap"
              }}
            >
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
                  window.genexDesktop?.copyText("G E N E X AI is ready.")
                }
              >
                نسخ نص
              </button>

              <button style={buttonStyle} onClick={() => setRole(null)}>
                رجوع
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
