import Header from "@/components/Header";
import Link from "next/link";

export const metadata = { title: "Новая поездка" };

export default function NewTripPage() {
  return (
    <>
      <Header title="Новая поездка" subtitle="Минимальная форма" />
      <div className="px-5 pb-32">
        <div className="bg-white rounded-card shadow-card p-5 text-text-sec text-[13px] leading-relaxed">
          Этот экран появится на Этапе 2. Пока добавить поездку можно через
          Cowork: положите документы в подпапку <code>C:\Путешествия\</code>
          {" "}и скажите: <em>«Добавь поездку из папки &lt;имя&gt;»</em>.
        </div>
        <Link
          href="/"
          className="block text-center mt-5 text-blue text-[14px] font-medium"
        >
          Назад
        </Link>
      </div>
    </>
  );
}
