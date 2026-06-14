import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { send } from '@emailjs/nodejs';

export interface NewAppointmentEmailData {
  doctorEmail: string | null;
  doctorName: string;
  serviceName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  patientName: string;
  patientPhone: string;
  patientEmail?: string | null;
  notes?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Trimite notificarea de programare nouă către doctor și/sau clinică.
   * Pacientul NU primește email. Eșecul nu trebuie să întrerupă fluxul de creare.
   */
  async notifyNewAppointment(data: NewAppointmentEmailData): Promise<void> {
    const serviceId = this.config.get<string>('EMAILJS_SERVICE_ID');
    const templateId = this.config.get<string>('EMAILJS_TEMPLATE_ID');
    const publicKey = this.config.get<string>('EMAILJS_PUBLIC_KEY');
    const privateKey = this.config.get<string>('EMAILJS_PRIVATE_KEY');
    const clinicEmail = this.config.get<string>('CLINIC_NOTIFY_EMAIL');

    if (!serviceId || !templateId || !publicKey || !privateKey) {
      this.logger.warn(
        'EmailJS neconfigurat (EMAILJS_*). Notificarea de programare a fost omisă.',
      );
      return;
    }

    const recipients = [data.doctorEmail, clinicEmail]
      .filter((e): e is string => !!e)
      .join(', ');

    const templateParams: Record<string, unknown> = {
      to_email: recipients,
      doctor_name: data.doctorName,
      service_name: data.serviceName,
      date: data.date,
      time: `${data.startTime}–${data.endTime}`,
      patient_name: data.patientName,
      patient_phone: data.patientPhone,
      patient_email: data.patientEmail ?? '-',
      notes: data.notes ?? '-',
    };

    await send(serviceId, templateId, templateParams, {
      publicKey,
      privateKey,
    });

    this.logger.log(
      `Notificare programare trimisă către: ${recipients || '(fără destinatar)'}`,
    );
  }
}
