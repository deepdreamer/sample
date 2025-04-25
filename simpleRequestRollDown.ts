import GlobalForm from './globalForm';
import {scrollToTarget} from '../../utils/scrollToElement';
import axios from 'axios';
import {addLoaderComponent, removeLoaderComponent} from '../loading';
import searchHousing from './searchHousing';
import simpleRequest from './simpleRequest';
import Datepicker from 'vanillajs-datepicker/Datepicker';

interface TranslationsRolldownSimpleRequest {
	title: string
	successSubmit: string
}

const RollDownSimpleRequestForm = () => {

	let translations : TranslationsRolldownSimpleRequest;
	let route : string;
	let arrivalInput : HTMLInputElement;
	let departureInput : HTMLInputElement;
	let arrivalInputContainer : HTMLDivElement;
	let departureInputContainer : HTMLDivElement;
	let departureInputDateTimePickerInstance: Datepicker;
	let flexibleMonthsContainer : HTMLDivElement;
	let form : HTMLFormElement;
	let toggleButton : HTMLButtonElement;
	let scrollToEl : HTMLDivElement;
	let formContainer : HTMLDivElement;
	let flexibleMonthsSwitch : HTMLInputElement;

	const toggleForm = (): void => {

		formContainer.classList.add('changing-state');

		setTimeout(() => { formContainer.classList.remove('changing-state'); }, 1000);

		if (formContainer.classList.contains('opened')) {
			closeForm();
		} else {
			openForm();
		}
	};

	const closeForm = (): void => {
		formContainer.classList.add('changing-state');
		setTimeout(() => { formContainer.classList.remove('changing-state'); }, 1000);
		formContainer.classList.remove('overflow-visible');
		formContainer.classList.remove('opened');
		setTimeout(() => { toggleButton.classList.remove('opened'); }, 1000);
	};

	const openForm = (): void => {
		formContainer.classList.add('opened');
		toggleButton.classList.add('opened');
		toggleButton.classList.remove('success-submit');
		const title = translations.title as string;
		setNewTextIntoSubmitBtn(title);
		setTimeout(() => { formContainer.classList.add('overflow-visible'); }, 1000);
	};

	const setFormToSuccessfullySubmittedState = (): void => {
		toggleButton.classList.add('success-submit');
		const title = translations.successSubmit as string;
		setNewTextIntoSubmitBtn(title);
	};

	const setNewTextIntoSubmitBtn = (text: string): void => {
		(toggleButton.querySelector('span') as HTMLSpanElement).innerHTML = text;
	};

	const setKurToUncheckedWhenWellnessSelected = (wellnessTypes: NodeListOf<HTMLInputElement>, kurTypes: NodeListOf<HTMLInputElement>, caterings: NodeListOf<HTMLInputElement>) : void => {
		wellnessTypes.forEach(wellnessType => {
			wellnessType.addEventListener('change', () => {
				if (wellnessType.checked) {
					kurTypes.forEach(kurType => {
						kurType.checked = false;
					});

					caterings.forEach(catering => {
						catering.checked = false;
					});
				}
			});
		});
	};

	const setWellnessToUncheckedWhenKurSelected = (wellnessTypes: NodeListOf<HTMLInputElement>, kurTypes: NodeListOf<HTMLInputElement>, caterings: NodeListOf<HTMLInputElement>) : void => {
		kurTypes.forEach(kurType => {
			kurType.addEventListener('change', () => {
				if (kurType.checked) {
					wellnessTypes.forEach(wellnessType => {
						wellnessType.checked = false;
					});
				}
			});
		});

		caterings.forEach(catering => {
			catering.addEventListener('change', () => {
				if (catering.checked) {
					wellnessTypes.forEach(wellnessType => {
						wellnessType.checked = false;
					});
				}
			});
		});
	};

	const setKurWellnessMutuallyExcluded = (): void => {
		const wellnessTypes = formContainer.querySelectorAll('#simple_request_rolldown_wellnessType input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
		const kurTypes = formContainer.querySelectorAll('#simple_request_rolldown_kurType input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
		const caterings = formContainer.querySelectorAll('#simple_request_rolldown_catering input[type="checkbox"]') as NodeListOf<HTMLInputElement>;

		setKurToUncheckedWhenWellnessSelected(wellnessTypes, kurTypes, caterings);
		setWellnessToUncheckedWhenKurSelected(wellnessTypes, kurTypes, caterings);
	};

	const hideFlexibleMonths = (): void => {
		flexibleMonthsContainer.classList.remove('opened');
		uncheckFlexibleMonths();
	};

	const uncheckFlexibleMonths = (): void => {
		const inputs = flexibleMonthsContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
		inputs.forEach(input => {
			input.checked = false;
		});
	};

	const toggleFlexibleMonths = (): void => {
		flexibleMonthsContainer.classList.toggle('opened');
		if (!flexibleMonthsContainer.classList.contains('opened')) {
			enableDatesInputs();
			uncheckFlexibleMonths();
		}
	};

	const setupFlexibleMonths = (): void => {
		flexibleMonthsSwitch.addEventListener('click', () => {
			toggleFlexibleMonths();
		});

		const inputs = flexibleMonthsContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;

		inputs.forEach(input => {
			input.addEventListener('change', () => {
				if (areSomeFlexibleMonthsChecked(inputs)) {
					disableDatesInputs();
				} else {
					enableDatesInputs();
				}
			});
		});
	};

	const areSomeFlexibleMonthsChecked = (inputs: NodeListOf<HTMLInputElement>): boolean => {
		return Array.from(inputs).some((input: HTMLInputElement) => {
			return input.checked;
		});
	};

	const disableDatesInputs = (): void => {
		arrivalInput.disabled = true;
		departureInput.disabled = true;
		arrivalInputContainer.classList.add('disabled');
		departureInputContainer.classList.add('disabled');
	};

	const enableDatesInputs = (): void => {
		arrivalInput.disabled = false;
		departureInput.disabled = false;
		arrivalInputContainer.classList.remove('disabled');
		departureInputContainer.classList.remove('disabled');
	};

	const initDomElements = (): void => {
		arrivalInput = formContainer.querySelector('#simple_request_rolldown_stays_0_startDate') as HTMLInputElement;
		departureInput = formContainer.querySelector('#simple_request_rolldown_stays_0_endDate') as HTMLInputElement;
		arrivalInputContainer = arrivalInput.closest('div') as HTMLDivElement;
		departureInputContainer = departureInput.closest('div') as HTMLDivElement;
		flexibleMonthsContainer = formContainer.querySelector('.months-container') as HTMLDivElement;
		departureInputDateTimePickerInstance = simpleRequest.assignDateTimePicker(departureInput);
		form = formContainer.querySelector('form') as HTMLFormElement;
		translations = JSON.parse(formContainer.dataset.translationKeys as string) as TranslationsRolldownSimpleRequest;
		route = formContainer.dataset.route as string;
		scrollToEl = formContainer.closest('.easy-request-rollup-rolldown') as HTMLDivElement;
		toggleButton = formContainer.querySelector('.dropdown-toggle') as HTMLButtonElement;
		flexibleMonthsSwitch = document.getElementById('simple_request_rolldown_flexible') as HTMLInputElement;
	};


	const init = (): void => {
		formContainer = document.querySelector('.simple-request-dropdown-container') as HTMLDivElement;
		if (formContainer === null) {
			return;
		}

		initDomElements();

		simpleRequest.assignDateTimePicker(arrivalInput);

		arrivalInput.addEventListener('changeDate', (e) => {
			searchHousing.openDepartureInput(e, departureInput, departureInputDateTimePickerInstance);
		});



		setKurWellnessMutuallyExcluded();

		toggleButton.addEventListener('click', () => {
			if (formContainer.classList.contains('changing-state')) {
				return;
			}

			toggleForm();
		});



		setupFlexibleMonths();

		GlobalForm.controlTopkurSelect(formContainer);


		form.addEventListener('submit', (e) => {
			e.preventDefault();

			const formData = new FormData(form);

			addLoaderComponent(formContainer);
			axios.post(route, formData, {
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			}).then(() => {
				removeLoaderComponent(formContainer);
				setFormToSuccessfullySubmittedState();
				closeForm();
				setTimeout(() => {
					enableDatesInputs();
					hideFlexibleMonths();
					scrollToTarget(scrollToEl, 130, window, 1);
				}, 200);
				form.reset();
			}).catch(() => {
				removeLoaderComponent(formContainer);
			});
		});

	};

	return {
		init: init,
	};
};

export default RollDownSimpleRequestForm();