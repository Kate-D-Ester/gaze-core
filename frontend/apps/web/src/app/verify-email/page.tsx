import { Suspense } from "react"
import { AccountPage } from "@/features/account/account-page"

export default function Page() {
  return (
    <Suspense>
      <AccountPage view="verify-email" />
    </Suspense>
  )
}
