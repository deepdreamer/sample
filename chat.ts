import axios from 'axios';
import {addLoaderComponent, removeLoaderComponent} from './loading';
import {BroadcastChannel} from 'broadcast-channel';
import {scrollToTarget} from '../utils/scrollToElement';
import {htmlToElement} from './packageMethods/htmlToElement';
import googleUTMParams from '../googleUTMParams';

interface Message {
	sent?: object;
	id?: number;
	message: string;
	urlPath?: string;
	way: MessageType;
	operator_name: string;
	operator_online?: boolean;
	operator_photo?: string;
	operator_photo_webp?: string;
	operator_id?: number;
	chat_users_id?: number;
}

interface OperatorData {
	email: string;
	id: number;
	name: string;
	surname: string;
	phone?: string;
	photo?: string | null | undefined;
	photo_webp?: string | null | undefined;
	photo_full_url?: string | null | undefined;
	photo_full_url_webp?: string | null | undefined;
	username: string;
	whatsapp?: string;
}

interface Translations {
	successFlash: string
	callbackTitle: string
	chatTitle: string
	timeoutMessage: string
	changeToCallback: string
	changeToChat: string
	errorMessage: string
	errorMessageBackend: string
	callbackIntroMessage: string
}

interface ChatFormValues {
	message: string
	csrfToken: string
}

interface DataToSend {
	message: string
	token: string
	'cf-turnstile-response': null | string
	marketingData: null | string
}


enum MessageType {
	IN = 'in',
	OUT = 'out'
}

const defaultPictureUrl = '/images/icons/avatar.png';
const exceptionChatNotFound = 'Main chat element with #chat id not fount in DOM structure.';
const exceptionChatDOMElementsMissing = 'Some DOM elements of chat are missing.';
const tokenInputMissing = 'Hidden input with csrf token is missing.';
const second = 1000;
const minute = second * 60;
const connectionRefreshInterval = second * 10;
const maxTimeToKeepRunningMs = minute * 30;

const Chat = () => {

	let mainRefreshInterval: string | number | null = null;

	const chat : HTMLElement | null = document.getElementById('chat') as HTMLDivElement | null;

	if (chat === null) {
		const init = (): void => {
			return;
		};

		return {
			init: init
		};
	}

	const chatHeader : HTMLDivElement = chat?.querySelector('#chat .chat-header') as HTMLDivElement;
	const operatorInfo : HTMLElement | null = chat?.querySelector('#chat .operator-info') as HTMLElement;
	const form : HTMLFormElement = chat?.querySelector('#chat form') as HTMLFormElement;
	const formSubmitBtn : HTMLButtonElement = chat?.querySelector('form button[type="submit"]') as HTMLButtonElement;
	const textArea : HTMLTextAreaElement | null = form?.querySelector('.chat-textarea') as HTMLTextAreaElement;
	const tokenInput: HTMLInputElement | null = form?.querySelector('#chat_form__token') as HTMLInputElement;
	const bubbleIcon : HTMLElement | null = chat?.querySelector('#chat .speech-bubble') as HTMLDivElement;
	const closeBtn : HTMLElement | null = chat?.querySelector('#chat .close-btn') as HTMLDivElement;
	const assistant : HTMLElement | null = chat?.querySelector('.chat-assistant') as HTMLDivElement;
	const messagesContainer : HTMLDivElement = chat?.querySelector('.messages') as HTMLDivElement;
	const chatBody : HTMLDivElement = chat?.querySelector('.chat-body') as HTMLDivElement;
	const logo = messagesContainer.querySelector('.logo') as HTMLPictureElement;
	const getChatDataRoute : string | undefined = document.getElementById('route_get_chat_data')?.dataset.route as string;
	const postMessageRoute : string | undefined = document.getElementById('route_post_message')?.dataset.route as string;
	const sendCallbackRoute : string | undefined = document.getElementById('route_callback_notification')?.dataset.route as string;
	const translationsJson : string | undefined = document.getElementById('chatTranslations')?.dataset.translations as string;
	const translations : Translations = JSON.parse(translationsJson) as Translations;
	const body: HTMLBodyElement = document.querySelector('body') as HTMLBodyElement;
	const defaultOperatorPhotoUrlEl : HTMLDivElement = document.getElementById('defaultOperatorPhotoUrl') as HTMLDivElement;
	const defaultOperatorPicUrl : string = defaultOperatorPhotoUrlEl.dataset.url as string;
	const receiveSound = new Audio('/sound/receive.wav') as HTMLAudioElement;
	let operatorPictureEl = operatorInfo.querySelector('.chat-operator-photo picture') as HTMLPictureElement;
	let operatorImgEl = operatorInfo.querySelector('.chat-operator-photo img') as HTMLImageElement;
	let chatTitle = operatorInfo.querySelector('.chat-title') as HTMLDivElement;
	let chatTitleParagraph = operatorInfo.querySelector('.chat-title p') as HTMLParagraphElement;
	let chatAssistantEl = operatorInfo.querySelector('.chat-assistant') as HTMLDivElement | null;
	let operatorNamePEl = operatorInfo.querySelector('.chat-assistant p') as HTMLParagraphElement;

	let mainOperatorInfo : OperatorData;
	let broadcastChannel : BroadcastChannel | undefined = undefined;

	let chatOpen = false;
	let scrollPosition: number;

	const lockScroll = () => {
		if (window.innerWidth < 568) {
			scrollPosition = window.scrollY || window.pageYOffset;
			body.style.top = `-${scrollPosition}px`;
			body.classList.add('chat-open');
		}
	};

	const unlockScroll = () => {
		if (window.innerWidth < 568) {
			body.style.removeProperty('top');
			body.classList.remove('chat-open');
			window.scrollTo(0, scrollPosition);
		}
	};

	const openChat = (chat : HTMLElement, propagate = false): void => {
		if (chat.classList.contains('opening') || chat.classList.contains('opened')) {
			return;
		}

		chat.classList.add('opening');

		lockScroll();

		if (propagate) {
			broadcastChannel?.postMessage('chat_open');
		}

		chat.classList.add('widened');
		setTimeout(() => chatBody.classList.remove('d-none'), 500);
		setTimeout(() => chat.classList.add('opened'), 500);
		setTimeout(() => assistant?.classList.remove('d-none'), 500);
		setTimeout(() => bubbleIcon?.classList.add('d-none'), 1000);
		setTimeout(() => closeBtn?.classList.remove('d-none'), 1000);

		if (!(messagesContainer instanceof HTMLDivElement)) {
			throw new Error(exceptionChatDOMElementsMissing);
		}

		const lastChild: HTMLDivElement | null = messagesContainer.querySelector('.message:last-child');
		if (lastChild === null) {
			throw new Error(exceptionChatDOMElementsMissing);
		}

		scrollToTarget(lastChild, 0, messagesContainer);

		chatOpen = true;
		setTimeout(() => chat.classList.remove('opening'), 1300);
	};

	const closeChat = (chat : HTMLElement, propagate = false): void => {
		if (chat.classList.contains('closing') || !chat.classList.contains('opened')) {
			return;
		}

		body.classList.remove('chat-open');
		chat.classList.add('closing');

		unlockScroll();

		const closeBtn = chat.querySelector('.close-btn');
		const bubbleIcon = chat.querySelector('.speech-bubble');

		if (propagate) {
			broadcastChannel?.postMessage('chat_close');
		}


		chat.classList.remove('opened');
		setTimeout(() => chatBody.classList.add('d-none'), 400);
		setTimeout(() => chat.classList.remove('widened'), 500);
		setTimeout(() => closeBtn?.classList.add('d-none'), 1000);
		setTimeout(() => bubbleIcon?.classList.remove('d-none'), 1000);

		chatOpen = false;
		setTimeout(() => chat.classList.remove('closing'), 1300);
	};

	const createIntroMessage = async (operatorName: string,
									  introMessage: string,
									  operatorPhoto?: string,
									  operatorPhotoWebp?: string | undefined | null,
									  operatorPhone?: string,
									  operatorWhatsApp?: string) : Promise<void> => {


		if (operatorPhoto === undefined || operatorPhoto === null || operatorPhoto === '') {
			operatorPhoto = defaultPictureUrl;
		}

		const message : Message = {
			operator_photo: operatorPhoto,
			operator_photo_webp: operatorPhotoWebp as string,
			operator_name: operatorName,
			message: introMessage,
			way: MessageType.OUT
		};

		const messageElement = createMessage(message.message, message.way, operatorName, message.operator_photo, message.operator_photo_webp);
		const anchorWhatsApp = messageElement.querySelector('.whatsapp-intro-msg') as HTMLAnchorElement;
		const anchorPhone = messageElement.querySelector('.phone-intro-msg') as HTMLAnchorElement;

		if (operatorPhone) {
			anchorPhone.innerHTML = operatorPhone;
		} else {
			anchorPhone.innerHTML = '';
		}

		anchorPhone.setAttribute('href', `tel:${operatorPhone}`);
		messageElement.classList.add('intro-message');
		if (operatorWhatsApp) {
			anchorWhatsApp.setAttribute('href', `https://wa.me/${operatorWhatsApp}`);
		} else {
			anchorWhatsApp.setAttribute('href', `https://wa.me/${operatorPhone}`);
		}

		messageElement.classList.add('intro-message');

		const chatEl = document.getElementById('chat') as HTMLDivElement;
		messagesContainer.appendChild(messageElement);
		scrollToTarget(messageElement, 0, chatEl);
	};

	const indicateThatMessageCouldNotBeSent = (message: HTMLDivElement): HTMLDivElement => {
		const messageText = message.querySelector('.message-text');
		const messageContent = message.querySelector('.message > div');
		messageText?.classList.add('error');

		const bangElement = document.createElement('div');
		bangElement.classList.add('d-flex', 'flex-column', 'justify-content-center', 'bang');
		bangElement.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';

		messageContent?.appendChild(bangElement);

		const errorMsg = document.createElement('p') as HTMLParagraphElement;

		errorMsg.innerText = translations.errorMessage;
		errorMsg.classList.add('error-text');
		message.appendChild(errorMsg);

		return message;
	};

	const createBackendConnectionErrorIndication = (): void => {
		const messages = chat.querySelector('.messages') as HTMLDivElement | null;
		const errorMessageAlreadyCreated = chat.querySelector('.messages > .error') as HTMLDivElement | null;
		if (errorMessageAlreadyCreated === null) {
			const message = document.createElement('div') as HTMLDivElement;
			message.classList.add('message', 'error');
			const paragraph = document.createElement('p') as HTMLParagraphElement;
			paragraph.innerHTML = translations.errorMessageBackend;
			message.appendChild(paragraph);
			messages?.appendChild(message);
			scrollToTarget(message, 0, chat);
		}
	};

	const removeBackendConnectionErrorIndication = (): void => {
		const errorMessageAlreadyCreated = chat.querySelector('.messages > .error') as HTMLDivElement | null;
		if (errorMessageAlreadyCreated !== null) {
			errorMessageAlreadyCreated.remove();
		}

	};

	const createMessage = (messageBody: string,
						   type: MessageType,
						   operatorName? : string,
						   operatorPhoto?: string,
						   operatorPhoto_webp?: string): HTMLDivElement => {
		const message = document.createElement('div') as HTMLDivElement;
		const messageText = document.createElement('div') as HTMLDivElement;
		const messageContent = document.createElement('div') as HTMLDivElement;
		const profilePictureContainer = document.createElement('div') as HTMLDivElement;
		const profilePicture = document.createElement('div') as HTMLDivElement;
		const image = document.createElement('img') as HTMLImageElement;
		const pictureElement = document.createElement('picture') as HTMLPictureElement;
		const sourceElement = document.createElement('source') as HTMLSourceElement;
		pictureElement.appendChild(sourceElement);
		pictureElement.appendChild(image);



		message.classList.add('message');

		messageContent.classList.add('d-flex');
		messageText.classList.add('message-text');
		profilePictureContainer.classList.add('profile-pic-container', 'd-flex', 'flex-column', 'justify-content-start');
		profilePicture.classList.add('profile-pic');

		if (type === MessageType.IN) {
			message.dataset.direction = 'in';
			messageContent.classList.add('message-in', 'justify-content-start');
			image.src = defaultPictureUrl;
		} else if (type === MessageType.OUT) {
			message.dataset.direction = 'out';
			messageContent.classList.add('message-out', 'justify-content-end');
			image.src = operatorPhoto !== undefined  ? operatorPhoto : defaultPictureUrl;
			image.alt = operatorName !== undefined ? operatorName : '';
			image.height = 70;
			image.width = 50;
			sourceElement.srcset = operatorPhoto_webp as string;
		}

		profilePicture.appendChild(pictureElement);
		profilePictureContainer.appendChild(profilePicture);
		messageText.innerHTML = messageBody;
		message.appendChild(messageContent);
		messageContent.appendChild(messageText);
		messageContent.appendChild(profilePictureContainer);

		return message;
	};

	const updateOperatorImage = (picture: HTMLPictureElement, url : string, alt? : string): void => {
		let sourceEl = picture.querySelector('source') as HTMLSourceElement | null;

		if (sourceEl == null) {
			sourceEl = document.createElement('source') as HTMLSourceElement;
			picture.prepend(sourceEl);
		}

		const urlInArrayForm = url.split('');
		const reversedUrlLetters = urlInArrayForm.reverse();
		const reversedUrl = reversedUrlLetters.join('');
		const reversedUrlParts = reversedUrl.split('.');
		reversedUrlParts.shift();
		const reversedUrlNoExtension = reversedUrlParts.join('.').split('').reverse().join('');
		sourceEl.srcset = `${reversedUrlNoExtension}.webp`;



		if (alt !== undefined) {
			operatorImgEl.alt = alt;
		}

		operatorImgEl.src = url;
	};


	const insertMessage = (message : Message): void => {
		const messages : HTMLDivElement = messagesContainer;

		let messageElement : HTMLDivElement;
		const messageText = '<p>' + message.message + '</p>';

		if (message.way === MessageType.IN) {
			messageElement = createMessage(messageText, MessageType.IN, message.operator_name, message.operator_photo, message.operator_photo_webp);
		} else if (message.way === MessageType.OUT) {
			messageElement = createMessage(messageText, MessageType.OUT, message.operator_name, message.operator_photo, message.operator_photo_webp);
		} else {
			throw new Error('Unknown message type (has to be either IN or OUT.');
		}

		if (message.id) {
			messageElement.dataset.idMessage = message.id.toString();
		}

		messages.appendChild(messageElement);
		messageElement.scrollIntoView();
	};

	const countAlreadyInsertedMessages = (): number => {
		const individualMessages : NodeListOf<HTMLDivElement> | undefined = chat.querySelectorAll('.messages .message');

		let count;
		if (individualMessages === undefined) {
			count = 0;
		} else {
			count = individualMessages.length;
		}

		// don't count intro message
		return count - 1;
	};

	const updateDomStructureWithMessages = (messages : Array<Message>): void => {
		if (messages.length < 1) {
			return;
		}

		const newlyCreatedMsgs = messagesContainer.querySelectorAll('.newly-created') as NodeListOf<HTMLElement>;
		// will be replaced by their copies from backend
		newlyCreatedMsgs.forEach((el: HTMLElement) => {
			el.remove();
		});

		messages.forEach((message: Message) => {
			const existingMessage = messagesContainer.querySelector(`.message[data-id-message='${message.id}']`);
			if (!existingMessage) {
				insertMessage(message);
			}
		});
	};

	const notifyUser = (messages: Array<Message>): void => {
		const lastMessage = messages.slice(-1)[0] as unknown as Message;
		const id = lastMessage.id?.toString() as string | undefined;

		if (id === undefined) {
			throw new Error('ID in message is missing');
		}

		// last message is sent by operator, make notification sound
		if (lastMessage.way === MessageType.OUT && !wasMessageAlreadyRead(id)) {
			receiveSound.play();

			chatHeader.classList.add('pulsating');
			// if chat closed open it
			if (!chatOpen) {
				openChat(chat, true);
			}
		}
	};

	const isChatInCallbackState = (): boolean => {
		return chat.dataset.operatorsOnline === 'false';
	};

	const isChatInNormalState = (): boolean => {
		return chat.dataset.operatorsOnline === 'true';
	};

	const loadMessagesAndOperator = async (forceRedraw = false): Promise<void> => {
		if (getChatDataRoute === undefined) {
			throw new Error('Route for getting messages missing.');
		}

		if (chat === null) {
			throw new Error(exceptionChatNotFound);
		}

		try {
			const response = await axios.get(getChatDataRoute);
			removeBackendConnectionErrorIndication();
			const messages = response.data.messages as Array<Message>;
			const operatorData = response.data.operator as OperatorData;
			const introMessage = response.data.introMessage as string;

			if (response.data.operatorOnline) {
				chat.dataset.operatorsOnline = 'true';
				operatorInfo?.classList.remove('callback');
				mainOperatorInfo = operatorData;

				let lastMessage = null;
				if (messages.length > 0) {
					lastMessage = messages[messages.length - 1];
				}

				const alreadyInserted = countAlreadyInsertedMessages();
				const lastId = getLastInsertedMessageId();

				if (lastId !== null && alreadyInserted > 0 && parseInt(lastId) === lastMessage?.id && !forceRedraw) {
					updateOperatorInfo(operatorData);
					return;
				}

				let currentOnlineOperatorPhoto = defaultPictureUrl;
				let currentOnlineOperatorPhotoWebp: string | null | undefined = '';

				if (mainOperatorInfo.photo_full_url !== null && mainOperatorInfo.photo_full_url !== undefined) {
					currentOnlineOperatorPhoto = mainOperatorInfo.photo_full_url;
					currentOnlineOperatorPhotoWebp = mainOperatorInfo.photo_full_url_webp;
				} else if (mainOperatorInfo.photo !== null && mainOperatorInfo.photo !== undefined) {
					currentOnlineOperatorPhoto =  mainOperatorInfo.photo;
					currentOnlineOperatorPhotoWebp = mainOperatorInfo.photo_webp;
				}

				const flashMessages = messagesContainer.querySelectorAll('.flash-message-callback') as NodeListOf<HTMLDivElement>;
				flashMessages.forEach((el: HTMLDivElement) => {
					el.remove();
				});

				updateOperatorInfo(operatorData);
				removePreviousIntroCallbackMessage();
				if (messages.length === 0) {
					// if no message yet sent by client use current online operator for intro message
					if (!introMessageExists()) {
						await createIntroMessage(mainOperatorInfo.name, introMessage, currentOnlineOperatorPhoto, currentOnlineOperatorPhotoWebp, mainOperatorInfo.phone, mainOperatorInfo.whatsapp);
					}
				} else {
					// otherwise use original operator that initiated the chat for intro message
					if (!introMessageExists()) {
						await createIntroMessage(messages[0].operator_name, introMessage, messages[0].operator_photo, messages[0].operator_photo_webp, mainOperatorInfo.phone, mainOperatorInfo.whatsapp);
					}
					updateDomStructureWithMessages(messages);
					notifyUser(messages);

					const lastMessage = messages.slice(-1)[0] as unknown as Message;
					if (lastMessage.way === MessageType.OUT) {
						setChatSessionOff();
						if (mainRefreshInterval) {
							clearInterval(mainRefreshInterval);
						}
					}

					const id = lastMessage.id?.toString() as string | undefined;
					if (id === undefined) {
						throw new Error('ID in message is missing');
					}
					// save id for next session
					saveLastReadMessageId(id);
				}
			} else {
				chat.dataset.operatorsOnline = 'false';
				operatorInfo?.classList.add('callback');

				recreateChatTitleElements();

				const msgEls = messagesContainer.querySelectorAll('.message') as NodeListOf<HTMLDivElement>;
				msgEls.forEach((el: HTMLDivElement) => {
					el.remove();
				});

				const callbackMessagesBody = `
					<div class="message intro-message callback">
						<div class="d-flex message-out justify-content-end">
							<div class="message-text">
								<p>${translations?.callbackIntroMessage}</p>
							</div>
							<div class="profile-pic-container d-flex flex-column justify-content-start">
								<div class="profile-pic">
									<img loading="lazy" src="${defaultOperatorPicUrl}" alt="pic" height="50" width="50">
								</div>
							</div>
						</div>
					</div>`;

				messagesContainer.appendChild(htmlToElement(callbackMessagesBody));
			}


		} catch (e) {
			console.log(e);
			createBackendConnectionErrorIndication();
		}
	};

	const removePreviousIntroCallbackMessage = () : void => {
		const existingMessages: NodeListOf<HTMLDivElement> = messagesContainer.querySelectorAll('.intro-message.callback');

		existingMessages.forEach((message: Element) => {
			message.remove();
		});
	};

	const introMessageExists = () : boolean => {
		const existingIntroMessage: NodeListOf<HTMLDivElement> = messagesContainer.querySelectorAll('.intro-message');

		return existingIntroMessage.length > 0;
	};

	const saveLastReadMessageId = (id: string) : void => {
		window.localStorage.setItem('lastReadMessageId', id);
	};

	const wasMessageAlreadyRead = (id: string) : boolean => {
		const savedId = window.localStorage.getItem('lastReadMessageId');

		return id === savedId;
	};

	const getLastInsertedMessageId = () : string | null => {
		return window.localStorage.getItem('lastReadMessageId');
	};

	const generateFlashMessageInChat = (message: string, additionalClasses: Array<string> | null = null) : void => {
		const flashMessage = document.createElement('div');
		const paragraph = document.createElement('p');

		paragraph.innerText = message;
		flashMessage.appendChild(paragraph);
		flashMessage.classList.add('flash-message');
		if (additionalClasses) {
			flashMessage.classList.add(...additionalClasses);
		}

		(chatBody.querySelectorAll('.flash-message') as NodeListOf<HTMLDivElement>).forEach((el: HTMLDivElement) => {
			el.remove();
		});

		logo.after(flashMessage);

		flashMessage.scrollIntoView();
	};

	const recreateOperatorImageElements = (): void => {
		operatorPictureEl = document.createElement('div');
		operatorPictureEl.classList.add('chat-operator-photo');
		chatTitle = operatorInfo.querySelector('.chat-title') as HTMLDivElement;
		operatorInfo.insertBefore(operatorPictureEl, chatTitle);
		const imgEl = document.createElement('img');
		imgEl.classList.add('img-fluid');
		imgEl.width = 35;
		imgEl.height = 35;
		operatorPictureEl.appendChild(imgEl);
		operatorImgEl = imgEl;
	};

	const recreateChatTitleElements = (): void => {
		chatTitle = document.createElement('div') as HTMLDivElement;
		chatTitle.classList.add('chat-title', 'text-uppercase');
		chatTitleParagraph = document.createElement('p') as HTMLParagraphElement;
		chatTitleParagraph.innerText = translations?.callbackTitle as string;
		chatTitle.appendChild(chatTitleParagraph);
		operatorInfo.innerHTML = '';
		operatorInfo.appendChild(chatTitle);
	};

	const recreateChatAssistantElements = (): void => {
		chatAssistantEl = document.createElement('div');
		chatAssistantEl.classList.add('chat-assistant');
		operatorInfo.appendChild(chatAssistantEl);

		operatorNamePEl = document.createElement('p');
		chatAssistantEl.appendChild(operatorNamePEl);
	};

	const updateOperatorInfo = (operatorData : OperatorData): void => {
		if (!operatorInfo.querySelector('.chat-operator-photo')) {
			recreateOperatorImageElements();
		}

		if (!operatorInfo.querySelector('.chat-assistant')) {
			recreateChatAssistantElements();
		}

		if (operatorData.photo_full_url !== null && operatorData.photo_full_url !== '' && operatorData.photo_full_url !== undefined) {
			updateOperatorImage(operatorPictureEl, operatorData.photo_full_url, operatorData.name);
		} else if (operatorData.photo !== null && operatorData.photo !== '' && operatorData.photo !== undefined) {
			updateOperatorImage(operatorPictureEl, operatorData.photo, operatorData.name);
		} else {
			updateOperatorImage(operatorPictureEl, defaultPictureUrl, operatorData.name);
		}

		chatTitleParagraph.innerText = translations?.chatTitle as string;
		if (operatorData.name) {
			operatorNamePEl.innerText = `(${operatorData.name})`;
		} else {
			operatorNamePEl.innerText = '';
		}

	};

	const setChatSessionOn = (): void  => {
		localStorage.setItem('chatSessionOn', 'true');
		localStorage.setItem('chatSessionOnTimestamp', new Date().toString());
	};

	const setChatSessionOff = (): void  => {
		localStorage.removeItem('chatSessionOn');
	};

	const isChatSessionOn = (): boolean => {
		// !! je konverze na boolean
		return !!(localStorage.getItem('chatSessionOn') && localStorage.getItem('chatSessionOn') === 'true');
	};

	const postMessage = (chatFormValues : ChatFormValues, append = true, isCallback = false): void => {

		const messageText = chatFormValues.message;
		const token = chatFormValues.csrfToken;

		if (postMessageRoute == undefined || sendCallbackRoute == undefined) {
			throw new Error('Route for posting messages missing.');
		}

		if (translations === null) {
			throw new Error('Translations are not defined.');
		}


		if (formSubmitBtn === null) {
			throw new Error(exceptionChatDOMElementsMissing);
		}

		const recaptchaResponseEl = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement;
		let route: string;

		const data: DataToSend = {
			message: messageText,
			token: token,
			'cf-turnstile-response': null,
			marketingData: null
		};


		if (!chat.querySelectorAll('[data-direction="in"].message').length) {
			const marketingData = googleUTMParams.getMarketingDataAsJsonString();
			data['marketingData'] = marketingData;
		}

		if (isCallback) {


			route = sendCallbackRoute;

			const badPhoneErrorMsg = chat.querySelector('.error-bad-phone-format') as HTMLSpanElement;

			textArea.classList.remove('invalid-phone');
			badPhoneErrorMsg.classList.add('d-none');

		} else {
			route = postMessageRoute;

			if (recaptchaResponseEl && recaptchaResponseEl.value) {
				data['cf-turnstile-response'] = recaptchaResponseEl.value;
			} else {
				data['cf-turnstile-response'] = null;
			}
		}

		axios.post(route, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		}).then(() => {

			textArea.value = '';

			const messageElement = createMessage(messageText, MessageType.IN);

			if (append) {
				messageElement.classList.add('newly-created');
				messagesContainer.appendChild(messageElement);
				scrollToTarget(messageElement, 0, messagesContainer);
			}

			broadcastChannel?.postMessage('chat_refresh');
			loadMessagesAndOperator(true);

			if (isCallback) {
				const flashMessages = messagesContainer.querySelectorAll('.flash-message') as NodeListOf<HTMLDivElement>;

				flashMessages.forEach((flashMessage: HTMLDivElement) => {
					flashMessage.remove();
				});

				setTimeout(() => {
					generateFlashMessageInChat(translations.successFlash, [ 'flash-message-callback' ]);
				}, 100);
				// scroll to top of page
				scrollToTarget(body);
			}
		}).catch(() => {
			removeLoaderComponent(formSubmitBtn);
			formSubmitBtn.disabled = false;

			let messageElement = createMessage(messageText, MessageType.IN);
			messageElement = indicateThatMessageCouldNotBeSent(messageElement);

			if (append) {
				messagesContainer.appendChild(messageElement);
				scrollToTarget(messageElement, 0, messagesContainer);
			}
		});

	};

	const restartChatRefreshLoop = (): void => {
		const startTime = new Date().getTime();
		clearInterval(mainRefreshInterval as number);
		initRefreshLoop(startTime);
	};

	const initRefreshLoop = (startTime: number): void => {
		mainRefreshInterval = setInterval(() => {
				if (new Date().getTime() - startTime > maxTimeToKeepRunningMs) {
					clearInterval(mainRefreshInterval as number);
					return;
				}
				loadMessagesAndOperator(true);
			},
			connectionRefreshInterval
		) as unknown as number;
	};

	const resetTextAreaHeight = (): void => {
		textArea.style.height = '50px';
	};

	const updateTextAreaHeight = (): void => {
		textArea.style.height = (textArea.scrollHeight) + 'px';
	};

	const submitMessage = async (e : SubmitEvent): Promise<void> => {
		e.preventDefault();
		const wasInCallbackState = isChatInCallbackState();
		broadcastChannel?.postMessage('chat_refresh');

		// tohle je dulezite, kontroluji stav operatorek na backendu pred odeslanim zpravy,
		// proto await, cekam na provedeni nez budu pokracovat dale
		await loadMessagesAndOperator(true);

		if (!wasInCallbackState && isChatInCallbackState()) {
			generateFlashMessageInChat(translations.changeToCallback, [ 'info' ]);
			return;
		} else if (wasInCallbackState && isChatInNormalState()) {
			generateFlashMessageInChat(translations.changeToChat);
			return;
		}

		if (textArea === null) {
			throw new Error(exceptionChatDOMElementsMissing);
		}

		if (tokenInput === null) {
			throw new Error(tokenInputMissing);
		}

		if (textArea.value === '' || tokenInput.value === '') {
			return;
		}

		resetTextAreaHeight();

		const chatFormValues: ChatFormValues = {
			message: textArea.value,
			csrfToken: tokenInput.value
		};

		if (isChatInCallbackState()) {
			postMessage(chatFormValues, false, true);
		} else {
			postMessage(chatFormValues, true);
		}

		setChatSessionOn();
		restartChatRefreshLoop();
	};

	const wrapperForSubmitMessage = async (e: Event): Promise<void> => {
		e.preventDefault();
		addLoaderComponent(formSubmitBtn);
		formSubmitBtn.disabled = true;
		await submitMessage(e as SubmitEvent);
		removeLoaderComponent(formSubmitBtn);
		formSubmitBtn.disabled = false;
	};

	const init = (): void => {
		if (chat === null) {
			return;
		}

		textArea.addEventListener('input', updateTextAreaHeight);
		textArea.addEventListener('focus', updateTextAreaHeight);
		textArea.addEventListener('blur', resetTextAreaHeight);

		try {
			broadcastChannel = new BroadcastChannel('chat_channel');
		} catch (e) {
			Object.assign(window, { BroadcastChannel });
			broadcastChannel = new BroadcastChannel('chat_channel');
		}

		broadcastChannel.onmessage = (event) => {
			if (event === 'chat_open') {
				openChat(chat);
			} else if (event === 'chat_close') {
				closeChat(chat);
			} else if (event === 'chat_refresh') {
				loadMessagesAndOperator(true);
			}
		};

		if (operatorInfo === null || closeBtn === null || bubbleIcon === null) {
			throw new Error(exceptionChatDOMElementsMissing);
		}

		operatorInfo.addEventListener('click', () => {
			openChat(chat, true);
		});

		bubbleIcon.addEventListener('click', () => {
			openChat(chat, true);
		});

		closeBtn.addEventListener('click', () => {
			closeChat(chat, true);
		});

		if (isChatInCallbackState()) {
			operatorInfo.classList.add('callback');
			form.dataset.operatorsOnline = 'true';
		} else {
			operatorInfo.classList.remove('callback');
			form.dataset.operatorsOnline = 'false';
		}


		formSubmitBtn.addEventListener('click', async (e: Event) => {
			wrapperForSubmitMessage(e);
		});

		form.addEventListener('submit', (e: Event) => {
			wrapperForSubmitMessage(e);
		});

		loadMessagesAndOperator(true).then(() => {
			if (isChatSessionOn()) {
				restartChatRefreshLoop();
			}
		});
	};

	return {
		init: init
	};
};

const chatComponent = Chat();

export default chatComponent;
