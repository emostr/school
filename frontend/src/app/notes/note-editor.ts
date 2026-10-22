import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { Attachment, Lesson, NoteDetail, PublishTarget, ScheduleDay } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { AttachmentsInput } from '../ui/attachments';
import { RichEditor } from '../editor/rich-editor';

type Kind = 'RICH' | 'FILES';

/**
 * Конспект двумя способами: просто приложить фото доски или PDF, либо
 * набрать в редакторе с формулами, таблицами и заготовками.
 */
@Component({
  selector: 'es-note-editor',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, AttachmentsInput, RichEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page [title]="id() ? 'правка конспекта' : 'новый конспект'">
      <ng-container page-actions>
        <a [routerLink]="id() ? ['/notes', id()] : ['/notes']" class="es-btn">отмена</a>
        <button type="button" class="es-btn es-btn-primary" [disabled]="busy() || loading()" (click)="save()">
          <es-icon name="save" [size]="18" /> {{ id() ? 'сохранить' : 'опубликовать' }}
        </button>
      </ng-container>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="space-y-5">
          <div class="grid gap-3 md:grid-cols-[140px_1fr_170px_1fr]">
            <div>
              <label class="es-label" for="note-class">класс</label>
              <select id="note-class" class="es-select" [ngModel]="classId()" (ngModelChange)="classId.set($event)">
                @for (target of targets(); track target.classId) {
                  <option [ngValue]="target.classId">{{ target.className }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="note-subject">предмет</label>
              <select id="note-subject" class="es-select" [ngModel]="subjectId()" (ngModelChange)="subjectId.set($event)">
                <option [ngValue]="''" disabled>выберите</option>
                @for (subject of subjects(); track subject.id) {
                  <option [ngValue]="subject.id">{{ subject.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="note-date">дата урока</label>
              <input id="note-date" type="date" class="es-input" [ngModel]="date()" (ngModelChange)="date.set($event)" />
            </div>
            <div>
              <label class="es-label" for="note-lesson">урок</label>
              <select id="note-lesson" class="es-select" [ngModel]="lessonNumber()" (ngModelChange)="lessonNumber.set($event)">
                <option [ngValue]="null">не указан</option>
                @for (lesson of dayLessons(); track lesson.number + lesson.group) {
                  <option [ngValue]="lesson.number">{{ lesson.number }}-й · {{ lesson.subject?.name }}</option>
                }
              </select>
            </div>
          </div>

          <div>
            <label class="es-label" for="note-title">название</label>
            <input id="note-title" class="es-input !text-lg" placeholder="Тема урока" maxlength="200" [(ngModel)]="title" />
          </div>

          <div>
            <span class="es-label">как оформить</span>
            <div class="grid max-w-xl grid-cols-2 gap-2">
              <button type="button" class="flex items-center gap-3 border-2 p-3 text-left" [class]="kind() === 'RICH' ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'" (click)="kind.set('RICH')">
                <es-icon name="edit" [size]="24" />
                <span><span class="block font-semibold">набрать текст</span><span class="block text-xs text-muted">редактор, формулы, таблицы</span></span>
              </button>
              <button type="button" class="flex items-center gap-3 border-2 p-3 text-left" [class]="kind() === 'FILES' ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'" (click)="kind.set('FILES')">
                <es-icon name="camera" [size]="24" />
                <span><span class="block font-semibold">фото или PDF</span><span class="block text-xs text-muted">снимки доски, тетради, файлы</span></span>
              </button>
            </div>
          </div>

          @if (kind() === 'RICH') {
            <es-editor #editor mode="full" imageScope="content" placeholder="Начните конспект или выберите заготовку…" [(value)]="content" />
            <div>
              <span class="es-label">вложения (необязательно)</span>
              <es-attachments-input [(value)]="attachments" />
            </div>
          } @else {
            <es-attachments-input [(value)]="attachments" label="добавить фото или PDF" />
          }
        </div>
      }
    </es-page>
  `,
})
export class NoteEditorPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly school = inject(School);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = input<string>();
  private readonly editor = viewChild<RichEditor>('editor');

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly targets = signal<PublishTarget[]>([]);
  protected readonly classId = signal('');
  protected readonly subjectId = signal('');
  protected readonly date = signal('');
  protected readonly lessonNumber = signal<number | null>(null);
  protected readonly kind = signal<Kind>('RICH');
  protected readonly content = signal('');
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly day = signal<ScheduleDay | null>(null);
  protected title = '';

  protected readonly subjects = computed(() => this.targets().find((t) => t.classId === this.classId())?.subjects ?? []);
  protected readonly dayLessons = computed(() =>
    (this.day()?.lessons ?? []).filter((lesson: Lesson) => lesson.status !== 'cancelled'),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
    effect(() => {
      const classId = this.classId();
      const date = this.date();
      untracked(() => void this.loadDay(classId, date));
    });
    // Выбрали урок из расписания — подставляем его предмет.
    effect(() => {
      const number = this.lessonNumber();
      const lesson = untracked(() => this.dayLessons().find((item) => item.number === number));
      if (lesson?.subject && untracked(() => this.subjects().some((s) => s.id === lesson.subject!.id))) {
        untracked(() => this.subjectId.set(lesson.subject!.id));
      }
    });
  }

  private async load(id: string | undefined): Promise<void> {
    this.loading.set(true);
    try {
      await this.school.loadInfo();
      this.targets.set(await this.api.get<PublishTarget[]>('/homework/targets'));
      if (id) {
        const note = await this.api.get<NoteDetail>(`/notes/${id}`);
        this.classId.set(note.classId);
        this.subjectId.set(note.subject.id);
        this.date.set(note.date);
        this.lessonNumber.set(note.lessonNumber);
        this.kind.set(note.kind);
        this.content.set(note.content);
        this.attachments.set(note.attachments);
        this.title = note.title;
      } else {
        const wanted = this.route.snapshot.queryParamMap.get('class') ?? '';
        const targets = this.targets();
        this.classId.set(targets.some((t) => t.classId === wanted) ? wanted : (targets[0]?.classId ?? ''));
        this.date.set(this.school.today());
        if (this.subjects().length === 1) this.subjectId.set(this.subjects()[0].id);
      }
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDay(classId: string, date: string): Promise<void> {
    if (!classId || !date) return;
    try {
      this.day.set(await this.api.get<ScheduleDay>(`/schedule/classes/${classId}/day`, { date }));
    } catch {
      this.day.set(null);
    }
  }

  protected async save(): Promise<void> {
    this.editor()?.flush();
    if (!this.subjectId()) {
      this.notify.error('Выберите предмет');
      return;
    }
    if (!this.title.trim()) {
      this.notify.error('Дайте конспекту название — обычно это тема урока');
      return;
    }
    this.busy.set(true);
    try {
      const body = {
        classId: this.classId(),
        subjectId: this.subjectId(),
        date: this.date(),
        lessonNumber: this.lessonNumber(),
        title: this.title.trim(),
        kind: this.kind(),
        content: this.kind() === 'RICH' ? this.content() : '',
        attachmentIds: this.attachments().map((item) => item.id),
      };
      const id = this.id();
      const saved = id ? await this.api.put<NoteDetail>(`/notes/${id}`, body) : await this.api.post<NoteDetail>('/notes', body);
      this.notify.success(id ? 'Конспект сохранён' : 'Конспект опубликован');
      await this.router.navigate(['/notes', saved.id]);
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
