import Header from "@/components/Header";
import TripForm from "../TripForm";
import { createTripAction } from "../actions";

export const metadata = { title: "Новая поездка" };

export default function NewTripPage() {
  return (
    <>
      <Header title="Новая поездка" back="/" />
      <div className="px-5 pb-32 pt-2">
        <TripForm action={createTripAction} submitLabel="Создать поездку" />
      </div>
    </>
  );
}
