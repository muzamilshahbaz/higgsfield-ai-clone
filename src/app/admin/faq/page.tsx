import Link from 'next/link'
import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  ResultCount,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cmsList } from '@/services/cms/crud'

import {
  createFaq,
  deleteFaq,
  reorderFaq,
  setFaqVisible,
  updateFaq,
} from '../_actions/content'

/**
 * FAQ management.
 *
 * The simplest of the content screens, and the template the rest follow: a Server
 * Component reads the rows, renders the table, and hands each row's actions to small
 * client controls with the id already bound.
 *
 * `.bind(null, row.id)` is the part worth noticing. A Server Action can be passed to a
 * client component as a prop, but an inline `(values) => updateFaq(row.id, values)`
 * cannot — a closure is not serialisable across that boundary. Binding produces a new
 * action reference that Next.js can send, which is what lets these pages stay server
 * components with no data in the browser bundle.
 */

const FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'question',
    label: 'Question',
    required: true,
    maxLength: 300,
    placeholder: 'Do I need my own API keys to start?',
    help: 'Write it the way somebody would actually ask it.',
  },
  {
    kind: 'textarea',
    name: 'answer',
    label: 'Answer',
    required: true,
    maxLength: 4000,
    rows: 6,
    help: 'Plain text. Answer the question in the first sentence, then add the detail.',
  },
  {
    kind: 'text',
    name: 'category',
    label: 'Category',
    half: true,
    placeholder: 'general',
    help: 'Groups questions for a future filtered view. Leave as general if unsure.',
  },
  {
    kind: 'boolean',
    name: 'is_visible',
    label: 'Visible on the landing page',
  },
]

export default async function AdminFaqPage() {
  await requireCapability('content:write', '/admin/faq')

  const rows = await cmsList('faq_entries', { orderBy: 'sort_order' })
  const ids = rows.map((row) => row.id)
  const visible = rows.filter((row) => row.is_visible).length

  return (
    <>
      <AdminPageHeader
        eyebrow="Content"
        title="FAQ"
        description="The questions band on the landing page, in order. An entry that is hidden stays in the table but is not rendered."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/#faq">View on site</Link>
            </Button>
            <RecordDialog
              title="New question"
              description="It appears at the end of the list. Reorder it afterwards with the arrows."
              fields={FIELDS}
              initial={{ category: 'general', is_visible: true }}
              action={createFaq}
              submitLabel="Add the question"
              successMessage="Question added."
              resetOnSave
              triggerLabel="New question"
            />
          </>
        }
      />

      <AdminPanel
        title={`${rows.length} question${rows.length === 1 ? '' : 's'}`}
        description={`${visible} shown on the landing page.`}
        footer="The landing page falls back to the six questions this app shipped with if every row here is deleted — so an empty table is never an empty section."
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title="No questions yet."
            description="The landing page is showing the built-in set. Add one here to take over."
          />
        ) : (
          <>
            <AdminTable
              head={
                <>
                  <Th className="w-20">Order</Th>
                  <Th>Question</Th>
                  <Th className="w-28">Category</Th>
                  <Th className="w-24">Visible</Th>
                  <Th className="w-40" />
                </>
              }
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <ReorderButtons
                      ids={ids}
                      id={row.id}
                      action={reorderFaq}
                      label={row.question.slice(0, 40)}
                    />
                  </Td>

                  <Td className="max-w-[28rem]">
                    <p className="font-medium">{row.question}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {row.answer}
                    </p>
                  </Td>

                  <Td>
                    <Badge variant="secondary">{row.category}</Badge>
                  </Td>

                  <Td>
                    <ToggleAction
                      checked={row.is_visible}
                      action={setFaqVisible.bind(null, row.id)}
                      label={`Show “${row.question.slice(0, 40)}” on the landing page`}
                    />
                  </Td>

                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <RecordDialog
                        title="Edit question"
                        fields={FIELDS}
                        initial={{
                          question: row.question,
                          answer: row.answer,
                          category: row.category,
                          is_visible: row.is_visible,
                        }}
                        action={updateFaq.bind(null, row.id)}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />

                      <DeleteButton
                        action={deleteFaq.bind(null, row.id)}
                        what="this question"
                        description={
                          <>
                            “{row.question}” will be removed from the landing page. The audit trail
                            keeps the question and answer.
                          </>
                        }
                        iconOnly
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </AdminTable>

            <ResultCount shown={rows.length} total={rows.length} noun="questions" />
          </>
        )}
      </AdminPanel>
    </>
  )
}
