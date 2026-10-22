import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDayLong } from '../core/dates';
import { Attachment, Homework, HomeworkTemplate, Lesson, PublishTarget, ScheduleDay } from '../core/types';
import { Flyout } from '../ui/flyout';
import { Icon } from '../ui/icon';
import { AttachmentsInput } from '../ui/attachments';
import { RichEditor } from '../editor/rich-editor';
import { BUILTIN_TEMPLATES } from './templates';

export interface HomeworkDraft {
  homework: Homework | null;
  classId: string;
  subjectId: string;
  date: string;
  lessonNumber: number | null;
}

/**
 * Форма задания. Дата и урок берутся из расписания: «к следующему уроку»
 * находит ближайший урок предмета, а список уроков дня подсказывает номер.
 */
@Component({
  selector: 'es-homework-flyout',
  imports: [FormsModule, Flyout, Icon, AttachmentsInput, RichEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-flyout [open]="!!draft()" [title]="draft()?.homework ? 'правка задания' : 'новое задание'" [width]="820" (closed)="closed.emit()">
      @if (draft()) {
        <div class="space-y-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="es-label" for="hw-class">класс</label>
              <select id="hw-class" class="es-select" [ngModel]="classId()" (ngModelChange)="classId.set($event); subjectId.set('')">
                @for (target of targets(); track target.classId) {
                  <option [ngValue]="target.classId">{{ target.className }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="hw-subject">предмет</label>
              <select id="hw-subject" class="es-select" [ngModel]="subjectId()" (ngModelChange)="subjectId.set($event)">
                <option [ngValue]="''" disabled>выберите</option>
                @for (subject of subjects(); track subject.id) {
                  <option [ngValue]="subject.id">{{ subject.name }}</option>
                }
              </select>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label class="es-label" for="hw-date">к какому дню</label>
              <input id="hw-date" type="date" class="es-input" [ngModel]="date()" (ngModelChange)="date.set($event)" />
            </div>
            <div>
              <label class="es-label" for="hw-lesson">урок</label>
              <select id="hw-lesson" class="es-select" [ngModel]="lessonNumber()" (ngModelChange)="lessonNumber.set($event)">
                <option [ngValue]="null">любой урок предмета в этот день</option>
                @for (lesson of dayLessons(); track lesson.number + lesson.group) {
                  <option [ngValue]="lesson.number">{{ lesson.number }}-й · {{ lesson.subject?.name }}{{ lesson.group ? ' (гр. ' + lesson.group + ')' : '' }}</option>
                }
              </select>
            </div>
            <button type="button" class="es-btn" [disabled]="!subjectId()" (click)="nextLesson()">
              <es-icon name="arrowRight" [size]="16" /> к следующему уроку
            </button>
          </div>
          @if (dateHint()) {
            <p class="-mt-3 text-sm" [class]="dateWarning() ? 'text-warning' : 'text-muted'">{{ dateHint() }}</p>
          }

          <div>
            <span class="es-label">заготовки</span>
            <div class="flex flex-wrap gap-1">
              @for (template of builtin; track template.title) {
                <button type="button" class="border border-line bg-surface px-2.5 py-1 text-xs hover:border-accent" (click)="useTemplate(template.content)">{{ template.title }}</button>
              }
              @for (template of personal(); track template.id) {
                <span class="inline-flex border border-accent/60 bg-accent-soft text-xs">
                  <button type="button" class="px-2.5 py-1 hover:text-accent-hover" (click)="useTemplate(template.content)">{{ template.title }}</button>
                  <button type="button" class="px-1.5 text-faint hover:text-danger" title="Удалить заготовку" (click)="removeTemplate(template)">×</button>
                </span>
              }
            </div>
          </div>

          <div>
            <div class="mb-1.5 flex items-end justify-between">
              <span class="es-label !mb-0">задание</span>
              <button type="button" class="text-xs text-accent-hover hover:underline" [disabled]="!content()" (click)="saveTemplate()">сохранить как заготовку</button>
            </div>
            <es-editor #editor mode="test" imageScope="content" placeholder="Что задано…" [(value)]="content" />
          </div>

          <div>
            <span class="es-label">вложения</span>
            <es-attachments-input [(value)]="attachments" label="фото или PDF" />
          </div>
        </div>
      }

      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="closed.emit()">отмена</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="busy()" (click)="save()">{{ draft()?.homework ? 'сохранить' : 'опубликовать' }}</button>
      </ng-container>
    </es-flyout>
  `,
})
export class HomeworkFlyout {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly school = inject(School);

  readonly draft = input<HomeworkDraft | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Homework>();

  private readonly editor = viewChild<RichEditor>('editor');
  protected readonly builtin = BUILTIN_TEMPLATES;
  protected readonly targets = signal<PublishTarget[]>([]);
  protected readonly personal = signal<HomeworkTemplate[]>([]);
  protected readonly classId = signal('');
  protected readonly subjectId = signal('');
  protected readonly date = signal('');
  protected readonly lessonNumber = signal<number | null>(null);
  protected readonly content = signal('');
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly day = signal<ScheduleDay | null>(null);
  protected readonly busy = signal(false);

  protected readonly subjects = computed(() => this.targets().find((t) => t.classId === this.classId())?.subjects ?? []);
  protected readonly dayLessons = computed(() =>
    (this.day()?.lessons ?? []).filter((lesson: Lesson) => lesson.status !== 'cancelled' && (!this.subjectId() || lesson.subject?.id === this.subjectId())),
  );
  protected readonly dateWarning = computed(() => Boolean(this.subjectId() && this.day() && !this.dayLessons().length));
  protected readonly dateHint = computed(() => {
    const day = this.day();
    if (!day || !this.date()) return '';
    if (day.holiday) return `${formatDayLong(this.date())} — ${day.holiday}`;
    if (this.dateWarning()) return `${formatDayLong(this.date())}: этого предмета по расписанию нет`;
    return formatDayLong(this.date());
  });

  constructor() {
    effect(() => {
      const draft = this.draft();
      if (!draft) return;
      untracked(() => {
        const hw = draft.homework;
        this.classId.set(hw?.classId ?? draft.classId);
        this.subjectId.set(hw?.subject.id ?? draft.subjectId);
        this.date.set(hw?.date ?? draft.date);
        this.lessonNumber.set(hw?.lessonNumber ?? draft.lessonNumber);
        this.content.set(hw?.content ?? '');
        this.attachments.set(hw?.attachments ?? []);
        void this.loadTargets();
      });
    });
    effect(() => {
      const classId = this.classId();
      const date = this.date();
      untracked(() => void this.loadDay(classId, date));
    });
  }

  private async loadTargets(): Promise<void> {
    try {
      const [targets, templates] = await Promise.all([
        this.api.get<PublishTarget[]>('/homework/targets'),
        this.api.get<HomeworkTemplate[]>('/homework/templates'),
      ]);
      this.targets.set(targets);
      this.personal.set(templates);
      if (!targets.some((t) => t.classId === this.classId()) && targets.length) {
        this.classId.set(targets[0].classId);
      }
      const subjects = this.subjects();
      if (!this.subjectId() && subjects.length === 1) {
        this.subjectId.set(subjects[0].id);
      }
    } catch (error) {
      this.notify.error(error);
    }
  }

  private async loadDay(classId: string, date: string): Promise<void> {
    if (!classId || !date) {
      this.day.set(null);
      return;
    }
    try {
      this.day.set(await this.api.get<ScheduleDay>(`/schedule/classes/${classId}/day`, { date }));
    } catch {
      this.day.set(null);
    }
  }

  protected async nextLesson(): Promise<void> {
    try {
      const after = this.school.today();
      const result = await this.api.get<{ lesson: (Lesson & { date: string }) | null }>(`/schedule/classes/${this.classId()}/next`, {
        subjectId: this.subjectId(),
        after,
      });
      if (!result.lesson) {
        this.notify.warning('В ближайшие недели этого предмета в расписании нет');
        return;
      }
      this.date.set(result.lesson.date);
      this.lessonNumber.set(result.lesson.number);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected useTemplate(html: string): void {
    const editor = this.editor();
    if (editor && this.content()) {
      editor.insertHtml(html);
    } else {
      this.content.set(html);
    }
  }

  protected async saveTemplate(): Promise<void> {
    const title = await this.notify.prompt({ title: 'Название заготовки', placeholder: 'например: «§ и номера»' });
    if (!title?.trim()) return;
    try {
      this.personal.set(await this.api.post<HomeworkTemplate[]>('/homework/templates', { title: title.trim(), content: this.content() }));
      this.notify.success('Заготовка сохранена');
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async removeTemplate(template: HomeworkTemplate): Promise<void> {
    try {
      this.personal.set(await this.api.delete<HomeworkTemplate[]>(`/homework/templates/${template.id}`));
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async save(): Promise<void> {
    if (!this.subjectId()) {
      this.notify.error('Выберите предмет');
      return;
    }
    this.busy.set(true);
    try {
      const body = {
        classId: this.classId(),
        subjectId: this.subjectId(),
        date: this.date(),
        lessonNumber: this.lessonNumber(),
        group: this.dayLessons().find((lesson) => lesson.number === this.lessonNumber())?.group ?? '',
        content: this.content(),
        attachmentIds: this.attachments().map((item) => item.id),
      };
      const existing = this.draft()?.homework;
      const result = existing
        ? await this.api.put<Homework>(`/homework/${existing.id}`, body)
        : await this.api.post<Homework>('/homework', body);
      this.notify.success(existing ? 'Задание обновлено' : 'Задание опубликовано');
      this.saved.emit(result);
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
