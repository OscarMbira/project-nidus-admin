import {
  buildPricingComparisonRows,
  formatMemberLimitFeature,
  formatPreviewPrice,
  getPreviewDiscount,
} from '@nidus-admin/shared'

const PLATFORM_PLAN_STYLES = {
  free: { bg: 'bg-gray-100', text: 'text-gray-600' },
  starter: { bg: 'bg-blue-100', text: 'text-blue-600' },
  professional: { bg: 'bg-purple-100', text: 'text-purple-600' },
  enterprise: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  lifetime: { bg: 'bg-purple-100', text: 'text-purple-600' },
}

const SIMULATOR_FAQ = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, you can cancel your subscription at any time. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'What happens after I cancel?',
    answer: 'You\'ll retain access to all features until your current billing period ends. After that, you\'ll be moved to the Free plan.',
  },
  {
    question: 'Can I upgrade or downgrade?',
    answer: 'Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the end of your billing period.',
  },
  {
    question: 'Is there a refund policy?',
    answer: 'We offer a 30-day money-back guarantee for all new subscriptions. Lifetime purchases are final but include all future updates.',
  },
]

function CheckIcon({ className = 'h-5 w-5 text-green-500' }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z" clipRule="evenodd" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="mx-auto h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="mr-1 inline-block h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="ml-2 inline-block h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
    </svg>
  )
}

function PlanTypeIcon({ planType, isLifetime = false }) {
  const key = isLifetime ? 'lifetime' : (planType || 'starter')
  const style = PLATFORM_PLAN_STYLES[key] || PLATFORM_PLAN_STYLES.starter

  return (
    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${style.bg}`}>
      <svg className={`h-6 w-6 ${style.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z" />
      </svg>
    </div>
  )
}

function PreviewDisabledButton({ children, className }) {
  return (
    <button
      type="button"
      disabled
      title="Preview only — users can select this on the live site"
      className={`cursor-default opacity-90 ${className}`}
    >
      {children}
    </button>
  )
}

function FeatureComparisonTable({ plans, className = '' }) {
  const comparisonRows = buildPricingComparisonRows(plans)
  if (!comparisonRows.length || !plans.length) return null

  return (
    <div className={`rounded-2xl bg-white p-8 shadow-lg ${className}`}>
      <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">Feature Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="w-12 px-4 py-4 text-left text-sm font-semibold text-gray-500">#</th>
              <th className="px-4 py-4 text-left font-semibold text-gray-900">Feature</th>
              {plans.map((plan) => (
                <th key={`${plan.plan_type}-${plan.billing_cycle}`} className="px-4 py-4 text-center font-semibold text-gray-900">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {comparisonRows.map((row, rowIndex) => (
              <tr key={row.label}>
                <td className="px-4 py-4 text-sm text-gray-500">{rowIndex + 1}</td>
                <td className="px-4 py-4 text-gray-700">{row.label}</td>
                {row.values.map((value, colIndex) => (
                  <td key={`${row.label}-${plans[colIndex]?.plan_type}`} className="px-4 py-4 text-center">
                    {typeof value === 'boolean' ? (
                      value ? <CheckIcon className="mx-auto h-5 w-5 text-green-500" /> : <XIcon />
                    ) : (
                      <span className="text-gray-700">{value}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlatformPricingLayout({
  plans,
  lifetimePlans,
  billingCycle,
  onBillingCycleChange,
}) {
  const allPlans = [
    ...plans.map((plan) => ({ plan, isLifetime: false })),
    ...lifetimePlans.map((plan) => ({ plan, isLifetime: true })),
  ]

  return (
    <div className="bg-gray-50 px-4 py-12 text-gray-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 rounded-2xl border border-slate-500/20 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 p-8 text-center shadow-xl md:p-12">
          <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
            Choose Your <span className="text-blue-300">Platform</span> Plan
          </h1>
          <p className="mx-auto mb-2 max-w-2xl text-xl text-slate-200">
            Select the perfect plan for your team&apos;s project management needs
          </p>
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            Compare features below and choose the plan that best fits your requirements
          </p>
        </div>

        <div className="mb-12 flex justify-center">
          <div className="inline-flex rounded-lg bg-white p-1 shadow">
            <button
              type="button"
              onClick={() => onBillingCycleChange?.('monthly')}
              className={`rounded-lg px-6 py-2 font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => onBillingCycleChange?.('yearly')}
              className={`rounded-lg px-6 py-2 font-medium transition-all ${
                billingCycle === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-2 rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                Save vs monthly
              </span>
            </button>
          </div>
        </div>

        {allPlans.length > 0 && (
          <div className="mb-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {allPlans.map(({ plan, isLifetime }) => {
                const discount = getPreviewDiscount(plan)
                const isPopular = Boolean(plan.is_popular)
                const memberLabel = formatMemberLimitFeature(plan.member_limit)

                return (
                  <div
                    key={`${plan.plan_type}-${plan.billing_cycle}-${isLifetime ? 'lifetime' : 'recurring'}`}
                    className={`relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-xl transition-transform ${
                      isLifetime
                        ? 'border-purple-300 bg-gradient-to-br from-blue-50 to-purple-50 shadow-purple-200/50'
                        : isPopular
                          ? 'z-10 border-blue-500 shadow-2xl ring-2 ring-blue-500/40 2xl:scale-[1.03]'
                          : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {isLifetime ? (
                      <div className="absolute right-0 top-0 rounded-bl-xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-md">
                        <SparklesIcon />
                        Lifetime
                      </div>
                    ) : isPopular ? (
                      <div className="absolute right-0 top-0 rounded-bl-xl bg-blue-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-md">
                        Most Popular
                      </div>
                    ) : null}

                    <div className="flex h-full flex-col p-6 md:p-7">
                      <PlanTypeIcon planType={plan.plan_type} isLifetime={isLifetime} />

                      <h3 className="mb-3 text-2xl font-bold text-gray-900">{plan.name}</h3>

                      <div className="mb-5">
                        <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                          {formatPreviewPrice(plan, isLifetime ? 'lifetime' : billingCycle)}
                        </span>
                        {isLifetime && (
                          <span className="ml-2 text-base font-medium text-gray-600">one-time</span>
                        )}
                        {!isLifetime && discount != null && (
                          <p className="mt-2 text-sm font-semibold text-green-600">{discount}% off</p>
                        )}
                        {memberLabel && (
                          <p className="mt-3 text-sm text-gray-600">
                            {memberLabel}
                            {plan.additional_member_price != null && (
                              <> · +${plan.additional_member_price}/extra member</>
                            )}
                          </p>
                        )}
                      </div>

                      {plan.previous_tier_name && (
                        <p className="mb-3 text-sm font-semibold text-gray-800">
                          Everything in {plan.previous_tier_name}, plus:
                        </p>
                      )}

                      <ul className="mb-6 flex-grow space-y-2.5">
                        {(plan.features || []).map((feature) => (
                          <li key={feature} className="flex items-start">
                            <CheckIcon className="mr-2 mt-0.5 h-5 w-5 text-green-500" />
                            <span className="text-sm font-medium text-gray-800">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <PreviewDisabledButton
                        className={`w-full rounded-lg px-4 py-3 text-sm font-semibold shadow-sm ${
                          isLifetime
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : isPopular
                              ? 'bg-blue-600 text-white'
                              : 'border-2 border-blue-600 bg-white text-blue-700'
                        }`}
                      >
                        {isLifetime ? 'Get Lifetime Access' : 'Get Started'}
                        <ArrowRightIcon />
                      </PreviewDisabledButton>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        <FeatureComparisonTable plans={plans} className="mb-16" />

        <div className="text-center">
          <p className="text-gray-600">
            Need help choosing? <span className="text-blue-600">Contact us</span> or{' '}
            <span className="text-blue-600">View Simulator Pricing</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function SimulatorPricingLayout({ plans, billingCycle = 'monthly', onBillingCycleChange }) {
  return (
    <div className="space-y-12 bg-gray-50 px-4 py-12 text-gray-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 rounded-2xl border border-slate-500/20 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 p-8 text-center shadow-xl md:p-12">
          <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
            Choose Your <span className="text-green-300">Simulator</span> Plan
          </h1>
          <p className="mx-auto mb-2 max-w-2xl text-xl text-slate-200">
            Select the perfect plan for your project management training needs
          </p>
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            Compare features below and choose the plan that best fits your learning goals
          </p>
        </div>

        {onBillingCycleChange && (
          <div className="mb-12 flex justify-center">
            <div className="inline-flex rounded-lg bg-white p-1 shadow">
              <button
                type="button"
                onClick={() => onBillingCycleChange('monthly')}
                className={`rounded-lg px-6 py-2 font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => onBillingCycleChange('yearly')}
                className={`rounded-lg px-6 py-2 font-medium transition-all ${
                  billingCycle === 'yearly'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="ml-2 rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                  Save vs monthly
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isPopular = Boolean(plan.is_popular)
            const isFree = Number(plan.price) === 0
            const isLifetime = plan.billing_cycle === 'lifetime'

            return (
              <div
                key={`${plan.plan_type}-${plan.billing_cycle}`}
                className={`relative flex h-full flex-col rounded-2xl border-2 bg-white p-6 shadow-xl transition-all md:p-7 ${
                  isLifetime
                    ? 'border-purple-300 bg-gradient-to-br from-blue-50 to-purple-50'
                    : isPopular
                      ? 'z-10 scale-[1.03] border-blue-500 shadow-2xl ring-2 ring-blue-500/40'
                      : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                    <span className="rounded-full bg-blue-500 px-4 py-1 text-sm font-medium text-white">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6 text-center">
                  <h3 className="mb-2 text-2xl font-bold text-gray-900">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                      {formatPreviewPrice(plan, billingCycle)}
                    </span>
                    {isLifetime && (
                      <span className="mt-1 block text-sm text-gray-600">one-time</span>
                    )}
                  </div>
                </div>

                {plan.previous_tier_name && (
                  <p className="mb-3 text-sm font-medium text-gray-700">
                    Everything in {plan.previous_tier_name}, plus:
                  </p>
                )}

                <ul className="mb-6 flex-grow space-y-3">
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-start">
                      <CheckIcon className="mr-2 mt-0.5 h-5 w-5 text-green-500" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <PreviewDisabledButton
                  className={`w-full rounded-lg px-4 py-3 font-medium transition-colors ${
                    isFree
                      ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                      : isPopular
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                        : 'bg-blue-500 text-white'
                  }`}
                >
                  {isFree ? 'Current Plan' : isLifetime ? 'Buy Lifetime Access' : 'Subscribe Now'}
                </PreviewDisabledButton>
              </div>
            )
          })}
        </div>

        <FeatureComparisonTable plans={plans} className="mb-8 mt-12" />

        <div className="rounded-xl bg-white p-8">
          <h2 className="mb-6 text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {SIMULATOR_FAQ.map((item) => (
              <div key={item.question}>
                <h3 className="mb-2 font-semibold">{item.question}</h3>
                <p className="text-sm text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SubscriptionPricingPreview({
  plans = [],
  lifetimePlans = [],
  system = 'platform',
  billingCycle = 'monthly',
  onBillingCycleChange,
}) {
  const recurringPlans = plans
  const platformLifetime = system === 'platform' ? lifetimePlans : []

  const hasContent = system === 'simulator'
    ? plans.length > 0
    : recurringPlans.length > 0 || platformLifetime.length > 0

  return (
    <div className="overflow-hidden rounded-xl border border-gray-600 bg-white shadow-2xl">
      <div className="border-b-2 border-amber-500 bg-amber-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm">
        Read-only admin preview — layout and copy match the live public pricing page. Buttons are disabled.
      </div>

      {!hasContent ? (
        <div className="bg-gray-50 p-10 text-center text-gray-500">No plans available for this view.</div>
      ) : system === 'simulator' ? (
        <SimulatorPricingLayout
          plans={plans}
          billingCycle={billingCycle}
          onBillingCycleChange={onBillingCycleChange}
        />
      ) : (
        <PlatformPricingLayout
          plans={recurringPlans}
          lifetimePlans={platformLifetime}
          billingCycle={billingCycle === 'lifetime' ? 'monthly' : billingCycle}
          onBillingCycleChange={onBillingCycleChange}
        />
      )}
    </div>
  )
}
