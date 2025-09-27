import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Form from "./form";
export const dynamic = 'force-dynamic';

const ForgotPasswordPage = async () => {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/new");
  }

  return <Form />;
};

export default ForgotPasswordPage;
