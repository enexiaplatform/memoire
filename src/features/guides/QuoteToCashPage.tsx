import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CashAgingChart, OrderToCashFunnel } from '../../components/marketing/charts';
import { GuideFurther, GuideLayout, GuidePoint, GuideQuote, GuideSection } from './GuideLayout';

/**
 * The differentiated page.
 *
 * Every pipeline tool on the market writes about follow-up. Almost none write
 * about what happens after Won, because almost none of them go there - the
 * category boundary is a signature, and everything past it is assumed to belong
 * to an ERP nobody in a ten-person business has.
 *
 * That is exactly the territory this product occupies, so it is the territory
 * worth owning in search. Written for the reader it is actually true for: a
 * trading, distribution or supply operator where the sale is half the job and
 * the cash is downstream of the win.
 */

const PUBLISHED = '2026-08-26';
const UPDATED = '2026-08-26';

export function QuoteToCashPage() {
  return (
    <GuideLayout
      title="Quote to Cash When It Is All One Person | Memoire"
      description="The seven steps between a signed order and money in the bank, the three places a small business loses cash in them, and how to run it without an ERP."
      path="/quote-to-cash"
      eyebrow="Order to cash"
      heading="Most tools stop at Won. The money doesn't arrive there."
      standfirst="A signature is roughly the halfway point. Between it and the payment clearing sit a contract, a deposit, a shipment, a delivery, an invoice and a due date — six handovers in a business that may not have six people. This is where a small operation quietly loses more money than it loses in the pipeline."
      published={PUBLISHED}
      updated={UPDATED}
    >
      <GuideSection id="the-gap" title="The gap between two systems is where the cash sits">
        <p>
          Almost every business runs two tools with a hole between them. The sales tool covers everything up to the
          win and then stops. The accounting tool starts at the invoice and works forward. Between <em>Won</em> and
          <em> invoiced</em> there is a stretch — production, shipping, delivery, acceptance — that belongs to
          neither, and it is precisely the stretch where money stops moving.
        </p>
        <p>
          The symptom is a number almost nobody has in front of them: how much have we delivered that we have not
          yet billed for. It is not a forecast and not a receivable. It is work already done, cost already paid, and
          revenue not yet requested — and because it lives in the hole between two systems, it is discovered rather
          than watched.
        </p>
        <GuideQuote>&ldquo;We delivered last month. Did anyone invoice it?&rdquo;</GuideQuote>
      </GuideSection>

      <GuideSection id="seven-steps" title="The seven steps, and who drops each one">
        <p>
          Written out, an order-to-cash cycle in a trading or distribution business is short enough to hold in your
          head — which is exactly why nobody writes it down, and why steps go missing.
        </p>
        <ol className="mt-2 space-y-4">
          {[
            ['Contract or PO', 'The customer’s commitment in writing. Until it exists, everything after it is you taking a risk on a conversation.'],
            ['Deposit', 'If the terms say 50% with the order, this is the first date that can be late — and the earliest warning you will ever get about a customer’s intent.'],
            ['Production or procurement', 'You commit your own money. This is where your obligation to a supplier starts running on a different clock from the customer’s obligation to you.'],
            ['Delivery or handover', 'The moment your cost is fully sunk and your claim on the money becomes real.'],
            ['Invoice', 'The step most often missed, because it feels administrative and follows the part that felt like the finish.'],
            ['Due date', 'Not a step you do — a date derived from the term agreed at quote time. If nobody derived it, nothing is ever late.'],
            ['Payment received', 'The only step that ends the cycle. Everything before it is work in progress.'],
          ].map(([title, blurb], index) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {index + 1}
              </span>
              <span>
                <strong className="font-display text-navy">{title}</strong>
                <span className="mt-1 block leading-8 text-gray-700">{blurb}</span>
              </span>
            </li>
          ))}
        </ol>
        <p>
          A useful test: for each open order, how many days has it been standing on its current step? Not how old
          the order is — how long it has been stuck. An order sitting six days at <em>Contract/PO</em> is normal. An
          order sitting twenty-five days there is a customer who has changed their mind and not told you.
        </p>
      </GuideSection>

      <GuideSection id="three-leaks" title="The three places the money actually leaks">
        <GuidePoint index={1} title="Delivered, not invoiced">
          <p>
            The largest and least visible. It is invisible because it is not late — nothing can be late before an
            invoice exists. The only way to see it is to compare two stages of the same order book, which requires
            that both stages live in the same place.
          </p>
        </GuidePoint>
        <GuidePoint index={2} title="Terms agreed, dates never derived">
          <p>
            &ldquo;50% with PO, 50% after delivery&rdquo; was agreed, written on the quote, and then never turned
            into two dates anybody watches. This is a data problem masquerading as a discipline problem: the
            information needed to build a full receivables aging already exists at quote time. It just has to be
            carried forward rather than retyped into a second system that does not know about the first.
          </p>
          <p>
            Watch for the inverse failure too. An order with <em>no</em> payment term recorded is not an order that
            can never be late — it is an order whose lateness nobody can compute. Those two are easy to confuse and
            expensive to confuse.
          </p>
        </GuidePoint>
        <GuidePoint index={3} title="Margin discovered after the fact">
          <p>
            In a business that buys in one currency and sells in another, the real margin on an order is the sale
            minus goods, freight, duty and the cost of however long the customer takes to pay. If that sum is done
            after delivery, it is a post-mortem. Done at quote time it is a price — and it is the same arithmetic
            either way.
          </p>
        </GuidePoint>
      </GuideSection>

      <GuideSection id="what-good-looks-like" title="What it looks like when it is working">
        <p>
          Two views answer almost every question in this cycle. The first is the order book by stage: where the
          money is, and how much of it stopped between two steps.
        </p>
      </GuideSection>

      {/* Each chart sits under the sentence that introduces it. Both were in one
          band below the first heading, which put the aging chart above the
          heading announcing it - a figure arriving before its own caption. The
          charts are drawn for a dark surface, the same as on the landing page. */}
      <ChartBand>
        <OrderToCashFunnel />
      </ChartBand>

      <GuideSection id="aging" title="And the second is how late the money already is">
        <p>
          Aging is not a finance report you produce once a month. It is the collection to-do list, and every due
          date in it was decided when the quote went out. If the terms travel with the order, this view costs
          nothing to maintain; if they do not, it costs a morning every month and is out of date by the afternoon.
        </p>
        <p>
          A rule that saves a surprising amount of pain: <strong className="text-navy">never re-enter a number that
          already exists somewhere.</strong> Every re-entry is a chance for two systems to disagree, and when they
          disagree about money, the argument is with a customer.
        </p>
      </GuideSection>

      <ChartBand>
        <CashAgingChart />
      </ChartBand>

      <GuideSection id="without-an-erp" title="Doing this without an ERP">
        <p>
          The conventional answer is an ERP, and for a business of forty people it may well be right. For a business
          of one to ten it usually is not: the implementation is longer than the sales cycle it is meant to
          shorten, and the thing that fails is not the software but the data entry it demands from people who are
          also the ones selling.
        </p>
        <p>The self-built version needs three properties, and most spreadsheets have one or two of them:</p>
        <p>
          <strong className="text-navy">One row per order, carried the whole way.</strong> Not a pipeline sheet
          and a separate delivery sheet and a separate receivables sheet. The moment there are three, reconciling
          them becomes a job.
        </p>
        <p>
          <strong className="text-navy">Status derived from what the records prove.</strong> A step should tick
          because a document exists, not because somebody remembered to change a cell. Tick by hand only the steps
          no document will ever prove.
        </p>
        <p>
          <strong className="text-navy">Days-on-step, visible.</strong> The single most useful column, and the one
          almost no home-made tracker has, because a spreadsheet does not know when a cell last changed.
        </p>
      </GuideSection>

      <GuideSection id="how-memoire" title="How Memoire does this">
        <p>
          Memoire follows one customer thread from the first conversation to the money landing.{' '}
          <strong className="text-navy">Orders</strong> is the order book in seven steps, showing how many days each
          order has been standing still. <strong className="text-navy">Cash Collection</strong> builds the
          receivables aging from the payment terms already written on the quote — nothing is re-entered.{' '}
          <strong className="text-navy">Cost Analysis</strong> lands goods, freight and duty against the sale, in a
          different currency from the sale if that is how the business buys, and does it at quote time so the margin
          is a decision rather than a discovery.
        </p>
        <p>
          It is not accounting software and does not try to be — no ledger, no tax, no payroll. It is the layer that
          keeps the thread from going quiet in the stretch where{' '}
          <Link to="/why-deals-go-quiet" className="text-brand-blue underline underline-offset-4">
            nothing else is watching
          </Link>
          .
        </p>
      </GuideSection>

      <GuideFurther
        links={[
          {
            to: '/why-deals-go-quiet',
            title: "Deals don't die. They go quiet.",
            blurb: 'The four silences in a B2B cycle, why each happens, and what to do about them with or without software.',
          },
          {
            to: '/legal/boundaries',
            title: 'What Memoire deliberately refuses to do',
            blurb: 'No CRM writeback, no AI service, no accounting, no manager scoreboard — and why each line is drawn there.',
          },
        ]}
      />
    </GuideLayout>
  );
}

/** A dark band for one chart. The charts are drawn for a dark surface. */
function ChartBand({ children }: { children: ReactNode }) {
  return <div className="mt-8 rounded-card bg-navy p-5 sm:p-8">{children}</div>;
}
