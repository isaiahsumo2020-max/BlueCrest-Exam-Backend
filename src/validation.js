import { z } from 'zod'

const id = z.string().trim().min(1).max(100)
const date = z.string().trim().min(1).max(100)
const status = z.string().trim().min(1).max(40)

export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) }).strict()
export const userSchema = z.object({ id, name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), password: z.string().max(200).optional(), role: z.enum(['admin', 'staff']), permissions: z.array(z.string().trim().min(1).max(80)).max(30), status: z.enum(['active', 'inactive']), createdAt: date.optional(), created_at: date.optional() }).strict()
export const programmeSchema = z.object({ id, name: z.string().trim().min(1).max(200), department: z.string().trim().min(1).max(200), duration: z.number().int().positive().max(20), totalSemesters: z.number().int().positive().max(40), status: z.enum(['active', 'inactive']) }).strict()
export const studentSchema = z.object({ id, studentId: z.string().trim().min(1).max(100), rollNumber: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), accessCode: z.string().trim().max(100).optional(), phone: z.string().trim().max(40), programmeId: id, currentSemester: z.number().int().positive().max(40), sessionId: id, status: z.enum(['active', 'inactive', 'graduated']), enrolledAt: date }).strict()
export const sessionSchema = z.object({ id, name: z.string().trim().min(1).max(100), startYear: z.number().int().min(1900).max(2200), endYear: z.number().int().min(1900).max(2200), status: z.enum(['active', 'completed', 'upcoming']) }).strict()
export const semesterSchema = z.object({ id, number: z.number().int().positive().max(40), name: z.string().trim().min(1).max(100), programmeId: id, sessionId: id, status: z.enum(['open', 'closed', 'results_published']) }).strict()
export const subjectSchema = z.object({ id, code: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(200), credits: z.number().int().positive().max(100), semesterNumber: z.number().int().positive().max(40), programmeId: id, components: z.array(z.object({ name: z.string().trim().min(1).max(80), maxMarks: z.number().positive().max(1000) }).strict()).min(1).max(20), passMark: z.number().int().min(0).max(100) }).strict()
export const marksSchema = z.object({ id, studentId: id, subjectId: id, semesterId: id, sessionId: id, components: z.record(z.union([z.number().finite(), z.string().trim().min(1).max(30)])) }).strict()
export const resultSchema = z.object({ id, studentId: id, semesterId: id, sessionId: id, gpa: z.number().finite().min(0).max(10), cgpa: z.number().finite().min(0).max(10), totalCredits: z.number().int().nonnegative().max(1000), earnedCredits: z.number().int().nonnegative().max(1000), overallStatus: z.enum(['pass', 'fail']), publicationStatus: z.enum(['draft', 'approved', 'published']), approvedBy: id.optional(), approvedAt: date.optional(), publishedAt: date.optional() }).strict()
export const resultStatusSchema = z.object({ resultId: id, publicationStatus: z.enum(['approved', 'published']), approvedBy: id.optional(), approvedAt: date.optional(), publishedAt: date.optional() }).strict()

export function validate(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body)
    if (!result.success) return response.status(400).json({ message: 'Invalid request data.', errors: result.error.flatten().fieldErrors })
    request.body = result.data
    return next()
  }
}
