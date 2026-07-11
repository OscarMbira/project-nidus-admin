export default function PendingActivation() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="max-w-md text-center text-gray-300">
        <p>Your account has been created. It is now pending activation by the Super Admin.</p>
        <p className="mt-4 text-sm text-gray-500">You will receive an email once your account is activated.</p>
      </div>
    </div>
  )
}
