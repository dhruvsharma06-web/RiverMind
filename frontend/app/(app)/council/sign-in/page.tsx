import { redirect } from "next/navigation";
export default function CouncilSignIn() {
  redirect("/login?next=/council");
}
