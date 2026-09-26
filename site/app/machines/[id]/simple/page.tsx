import { notFound } from "next/navigation";
import { getMachineHallSummaries, getMachineIds } from "@/lib/machines";
import { simpleEvSet } from "@/lib/ev/simple-ev-tables";
import { SimpleEvPageClient } from "./SimpleEvPageClient";

type SimpleEvPageProps = {
  params: Promise<{ id: string }>;
};

/** 簡易期待値表（持ち込み）がある機種だけページを書き出す。
 *  店舗選択ページの別枠から来る。店舗別の実測データとは別物なので店舗idを持たない。 */
export async function generateStaticParams() {
  return (await getMachineIds()).filter((id) => simpleEvSet(id)).map((id) => ({ id }));
}

export default async function SimpleEvPage({ params }: SimpleEvPageProps) {
  const { id } = await params;
  const set = simpleEvSet(id);
  const machine = (await getMachineHallSummaries(id))[0]?.summary;
  if (!set || !machine) notFound();
  return <SimpleEvPageClient machineId={id} machineName={machine.name} set={set} />;
}
